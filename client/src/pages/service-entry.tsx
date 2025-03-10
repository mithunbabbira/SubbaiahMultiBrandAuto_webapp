import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { ref, push, get, set } from "firebase/database";
import { database } from "@/lib/firebase";
import { ServiceEntry, serviceEntrySchema } from "@shared/schema";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";

export default function ServiceEntryPage({ params }: { params: { number: string } }) {
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [isNewVehicle, setIsNewVehicle] = useState(true);
  const [isEditMode, setIsEditMode] = useState(false);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const vehicleNumber = decodeURIComponent(params.number).toUpperCase();

  // Parse URL for edit parameter
  useEffect(() => {
    const url = new URL(window.location.href);
    const editId = url.searchParams.get('edit');
    if (editId) {
      setIsEditMode(true);
      setServiceId(editId);
    }
  }, []);

  // Check if vehicle has any existing records
  useEffect(() => {
    async function checkExistingRecords() {
      try {
        const servicesRef = ref(database, `services/${vehicleNumber}`);
        const snapshot = await get(servicesRef);
        setIsNewVehicle(!snapshot.exists());
      } catch (error) {
        console.error("Error checking existing records:", error);
      }
    }
    checkExistingRecords();
  }, [vehicleNumber]);

  // Initialize form with default values
  const form = useForm<ServiceEntry>({
    resolver: zodResolver(serviceEntrySchema),
    defaultValues: {
      id: "",
      vehicleNumber,
      date: new Date().toISOString().split('T')[0],
      kilometerReading: 0,
      spareParts: [],
      serviceItems: [],
      totalSpareCost: 0,
      totalServiceCost: 0,
      totalCost: 0
    }
  });

  // Load service data if in edit mode
  useEffect(() => {
    async function loadServiceData() {
      if (isEditMode && serviceId) {
        try {
          setLoading(true);
          const servicesRef = ref(database, `services/${vehicleNumber}`);
          const snapshot = await get(servicesRef);
          
          if (snapshot.exists()) {
            const data = snapshot.val();
            // Find the service with matching ID
            const serviceEntries = Object.entries(data);
            for (const [key, value] of serviceEntries) {
              const service = value as ServiceEntry;
              if (service.id === serviceId) {
                // Check if service date is today
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const serviceDate = new Date(service.date);
                serviceDate.setHours(0, 0, 0, 0);
                
                if (serviceDate.getTime() !== today.getTime()) {
                  toast({
                    variant: "destructive",
                    title: "Cannot Edit",
                    description: "You can only edit service entries from today."
                  });
                  setLocation(`/service-history/${encodeURIComponent(vehicleNumber)}`);
                  return;
                }
                
                // Format date for form
                const formattedDate = new Date(service.date).toISOString().split('T')[0];
                
                // Reset form with service data
                form.reset({
                  ...service,
                  date: formattedDate
                });
                
                // Store the Firebase key for this service
                setServiceId(key);
                break;
              }
            }
          }
        } catch (error) {
          console.error("Error loading service data:", error);
          toast({
            variant: "destructive",
            title: "Error",
            description: "Failed to load service data for editing."
          });
        } finally {
          setLoading(false);
        }
      }
    }
    
    loadServiceData();
  }, [isEditMode, serviceId, vehicleNumber, form, setLocation, toast]);

  const spareParts = form.watch("spareParts");
  const serviceItems = form.watch("serviceItems");

  const calculateTotals = () => {
    const currentSpareParts = form.getValues("spareParts");
    const currentServiceItems = form.getValues("serviceItems");
    
    const totalSpareCost = currentSpareParts.reduce((sum, part) => sum + (Number(part.cost) || 0), 0);
    const totalServiceCost = currentServiceItems.reduce((sum, item) => sum + (Number(item.cost) || 0), 0);
    const totalCost = totalSpareCost + totalServiceCost;
    
    return { totalSpareCost, totalServiceCost, totalCost };
  };

  // Update totals whenever spareParts or serviceItems change
  useEffect(() => {
    const totals = calculateTotals();
    form.setValue("totalSpareCost", totals.totalSpareCost);
    form.setValue("totalServiceCost", totals.totalServiceCost);
    form.setValue("totalCost", totals.totalCost);
  }, [spareParts, serviceItems]);

  const addSparePart = () => {
    const currentParts = form.getValues("spareParts");
    form.setValue("spareParts", [...currentParts, { name: "", cost: 0 }]);
  };

  const removeSparePart = (index: number) => {
    const currentParts = form.getValues("spareParts");
    form.setValue("spareParts", currentParts.filter((_, i) => i !== index));
  };

  const addServiceItem = () => {
    const currentItems = form.getValues("serviceItems");
    form.setValue("serviceItems", [...currentItems, { description: "", cost: 0 }]);
  };

  const removeServiceItem = (index: number) => {
    const currentItems = form.getValues("serviceItems");
    form.setValue("serviceItems", currentItems.filter((_, i) => i !== index));
  };

  const handleBack = () => {
    if (isNewVehicle) {
      setLocation("/"); // Go to home page for new vehicles
    } else {
      setLocation(`/service-history/${encodeURIComponent(vehicleNumber)}`); // Go to history for existing vehicles
    }
  };

  async function onSubmit(data: ServiceEntry) {
    setLoading(true);
    try {
      console.log("Attempting to save service record:", { vehicleNumber, data, isEditMode });
      
      // Calculate final totals
      const totals = calculateTotals();
      
      // Format the data
      const formattedData = {
        ...data,
        date: new Date(data.date).toISOString(),
        spareParts: data.spareParts.map(part => ({
          name: part.name.trim(),
          cost: Number(part.cost) || 0
        })),
        serviceItems: data.serviceItems.map(item => ({
          description: item.description.trim(),
          cost: Number(item.cost) || 0
        })),
        totalSpareCost: totals.totalSpareCost,
        totalServiceCost: totals.totalServiceCost,
        totalCost: totals.totalCost
      };
      
      if (isEditMode && serviceId) {
        // Update existing service
        const serviceRef = ref(database, `services/${vehicleNumber}/${serviceId}`);
        await set(serviceRef, formattedData);
        toast({
          title: "Success",
          description: "Service record updated successfully"
        });
      } else {
        // Create new service
        const servicesRef = ref(database, `services/${vehicleNumber}`);
        const newData = {
          ...formattedData,
          id: Date.now().toString(),
        };
        await push(servicesRef, newData);
        toast({
          title: "Success",
          description: "Service record saved successfully"
        });
      }

      setLocation(`/service-history/${encodeURIComponent(vehicleNumber)}`);
    } catch (error: any) {
      console.error("Error saving service:", error);
      console.error("Error code:", error.code);
      console.error("Error message:", error.message);

      let errorMessage = isEditMode 
        ? "Failed to update service record. " 
        : "Failed to save service record. ";
        
      if (error.code === "PERMISSION_DENIED") {
        errorMessage += "Please check if you have write permissions.";
      } else {
        errorMessage += "Please check your connection and try again.";
      }

      toast({
        variant: "destructive",
        title: "Error",
        description: errorMessage
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-primary">Subbaiah Multi Brand Auto</h1>
        </div>

        <Button
          variant="ghost"
          onClick={handleBack}
          className="mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>

        <Card>
          <CardHeader>
            <h1 className="text-2xl font-bold">{isEditMode ? "Edit Service Entry" : "New Service Entry"}</h1>
            <p className="text-sm text-muted-foreground">
              Vehicle Number: {vehicleNumber}
            </p>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Service Date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="kilometerReading"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Current Kilometer Reading</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="0"
                          step="1"
                          placeholder="Enter current kilometer reading"
                          {...field}
                          value={field.value || ""}
                          onChange={e => {
                            const value = e.target.value;
                            field.onChange(value === "" ? "" : Number(value));
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium">Spare Parts</h3>
                    <Button type="button" variant="outline" onClick={addSparePart}>
                      <Plus className="w-4 h-4 mr-2" />
                      Add Part
                    </Button>
                  </div>

                  {spareParts.map((_, index) => (
                    <div key={index} className="flex gap-4">
                      <FormField
                        control={form.control}
                        name={`spareParts.${index}.name`}
                        render={({ field }) => (
                          <FormItem className="flex-1">
                            <FormControl>
                              <Input placeholder="Part name" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={`spareParts.${index}.cost`}
                        render={({ field }) => (
                          <FormItem className="flex-1">
                            <FormControl>
                              <Input
                                type="number"
                                min="0"
                                step="1"
                                placeholder="Cost"
                                {...field}
                                value={field.value || ""}
                                onChange={e => {
                                  const value = e.target.value;
                                  field.onChange(value === "" ? "" : Number(value));
                                  // Recalculate totals immediately
                                  const totals = calculateTotals();
                                  form.setValue("totalSpareCost", totals.totalSpareCost);
                                  form.setValue("totalServiceCost", totals.totalServiceCost);
                                  form.setValue("totalCost", totals.totalCost);
                                }}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        onClick={() => removeSparePart(index)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium">Service Items</h3>
                    <Button type="button" variant="outline" onClick={addServiceItem}>
                      <Plus className="w-4 h-4 mr-2" />
                      Add Service
                    </Button>
                  </div>

                  {serviceItems.map((_, index) => (
                    <div key={index} className="flex gap-4">
                      <FormField
                        control={form.control}
                        name={`serviceItems.${index}.description`}
                        render={({ field }) => (
                          <FormItem className="flex-1">
                            <FormControl>
                              <Input placeholder="Service description" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={`serviceItems.${index}.cost`}
                        render={({ field }) => (
                          <FormItem className="flex-1">
                            <FormControl>
                              <Input
                                type="number"
                                min="0"
                                step="1"
                                placeholder="Cost"
                                {...field}
                                value={field.value || ""}
                                onChange={e => {
                                  const value = e.target.value;
                                  field.onChange(value === "" ? "" : Number(value));
                                  // Recalculate totals immediately
                                  const totals = calculateTotals();
                                  form.setValue("totalSpareCost", totals.totalSpareCost);
                                  form.setValue("totalServiceCost", totals.totalServiceCost);
                                  form.setValue("totalCost", totals.totalCost);
                                }}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        onClick={() => removeServiceItem(index)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>

                <div className="pt-4 border-t">
                  <div className="space-y-1">
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>Spare Parts Total</span>
                      <span>₹{form.watch("totalSpareCost")}</span>
                    </div>
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>Service Items Total</span>
                      <span>₹{form.watch("totalServiceCost")}</span>
                    </div>
                    <div className="flex justify-between text-lg font-bold">
                      <span>Total Cost</span>
                      <span>₹{form.watch("totalCost")}</span>
                    </div>
                  </div>
                </div>

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Saving..." : isEditMode ? "Update Service Record" : "Save Service Record"}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}