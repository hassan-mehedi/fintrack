"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createCategory,
  deleteCategory,
  updateCategory,
} from "@/lib/actions/categories";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { categorySchema, type CategoryInput } from "@fintrack/shared/validators";
import type { Category } from "@fintrack/shared/types";
import { toast } from "sonner";
import { Plus, Trash2, Loader2, Pencil } from "lucide-react";

const CATEGORY_ICONS = [
  "🍔", "🚗", "🏠", "💡", "🎬", "🏥", "🛍️", "📚",
  "🛒", "📱", "👕", "💈", "💰", "💻", "🏢", "📈",
  "🎁", "📌", "💸", "🎮", "✈️", "🐾", "🎵", "⚽",
];

const CATEGORY_TYPE_LABELS: Record<Category["type"], string> = {
  expense: "Expense",
  income: "Income",
  both: "Both",
};

const EMPTY_CATEGORY: CategoryInput = {
  name: "",
  icon: "📌",
  color: "#6b7280",
  type: "expense",
};

const SECTIONS: { type: Category["type"]; title: string }[] = [
  { type: "expense", title: "Expense Categories" },
  { type: "income", title: "Income Categories" },
  { type: "both", title: "Income & Expense Categories" },
];

export function CategoriesClient({ categories }: { categories: Category[] }) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<CategoryInput>({
    resolver: zodResolver(categorySchema),
    defaultValues: EMPTY_CATEGORY,
  });

  useEffect(() => {
    if (!formOpen) return;
    form.reset(
      editingCategory
        ? {
            name: editingCategory.name,
            icon: editingCategory.icon,
            color: editingCategory.color,
            type: editingCategory.type,
          }
        : EMPTY_CATEGORY
    );
  }, [editingCategory, formOpen, form]);

  const openCreate = () => {
    setEditingCategory(null);
    setFormOpen(true);
  };

  const openEdit = (category: Category) => {
    setEditingCategory(category);
    setFormOpen(true);
  };

  const onSubmit = async (data: CategoryInput) => {
    setIsLoading(true);
    try {
      if (editingCategory) {
        await updateCategory(editingCategory.id, data);
        toast.success("Category updated");
      } else {
        await createCategory(data);
        toast.success("Category created");
      }
      setFormOpen(false);
      setEditingCategory(null);
      router.refresh();
    } catch {
      toast.error(
        editingCategory ? "Failed to update category" : "Failed to create category"
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteCategory(id);
      toast.success("Category deleted");
      router.refresh();
    } catch {
      toast.error("Failed to delete category");
    }
  };

  const sections = SECTIONS.map((section) => ({
    ...section,
    items: categories.filter((c) => c.type === section.type),
  })).filter((section) => section.items.length > 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Categories</h1>
          <p className="text-muted-foreground">
            Manage your transaction categories
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-1 h-4 w-4" /> Add Category
        </Button>
      </div>

      {sections.map((section) => (
        <div key={section.type}>
          <h2 className="text-lg font-semibold mb-3">{section.title}</h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {section.items.map((cat) => (
              <div
                key={cat.id}
                className="flex items-center justify-between rounded-lg border p-3"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-8 w-8 items-center justify-center rounded-md text-lg"
                    style={{ backgroundColor: cat.color + "20" }}
                  >
                    {cat.icon}
                  </div>
                  <span className="font-medium">{cat.name}</span>
                  {cat.isDefault && (
                    <Badge variant="secondary" className="text-xs">
                      Default
                    </Badge>
                  )}
                </div>
                <div className="flex items-center">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground"
                    onClick={() => openEdit(cat)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  {!cat.isDefault && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => handleDelete(cat.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      <Dialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditingCategory(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingCategory ? "Edit Category" : "Add Category"}
            </DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Category name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Type</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                        items={CATEGORY_TYPE_LABELS}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {Object.entries(CATEGORY_TYPE_LABELS).map(([value, label]) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="color"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Color</FormLabel>
                      <FormControl>
                        <Input type="color" className="h-10 w-20" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="icon"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Icon</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Any emoji"
                        className="text-lg"
                        {...field}
                      />
                    </FormControl>
                    <div className="flex flex-wrap gap-1">
                      {CATEGORY_ICONS.map((icon) => (
                        <button
                          key={icon}
                          type="button"
                          onClick={() => field.onChange(icon)}
                          className={`flex h-8 w-8 items-center justify-center rounded-md border text-lg transition-colors hover:bg-muted ${
                            field.value === icon ? "border-primary bg-muted" : ""
                          }`}
                        >
                          {icon}
                        </button>
                      ))}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {editingCategory ? "Save Changes" : "Create Category"}
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
