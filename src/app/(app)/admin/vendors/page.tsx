"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import {
  Link2Off,
  Plus,
  Search,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { PRODUCT_CATEGORIES } from "@/lib/categories";
import { useToast } from "@/components/app-toast";

type TaxonomyContact = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  isPrimary: boolean;
};

type TaxonomyVendor = {
  vendorId: string;
  vendorName: string;
  vendorCategoryId: string;
  active: boolean;
  phone: string;
  email: string;
  contacts: TaxonomyContact[];
};

type TaxonomySubcategory = {
  subcategory: string;
  fromCatalog: boolean;
  fromAdmin?: boolean;
  vendorCount: number;
  vendors: TaxonomyVendor[];
};

type TaxonomyCategory = {
  category: string;
  subcategoryCount: number;
  vendorCount: number;
  subcategories: TaxonomySubcategory[];
};

type VendorListItem = {
  id: string;
  name: string;
  phone: string;
  email: string;
  active: boolean;
  categories: Array<{
    id?: string;
    category: string;
    subcategory: string;
    keywords: string[];
  }>;
  contacts: Array<{
    id?: string;
    name: string;
    email: string;
    phone: string;
    role: string;
    isPrimary: boolean;
    vendorCategoryId?: string | null;
    category?: string;
    subcategory?: string;
  }>;
};

type MapPoc = {
  name: string;
  email: string;
  phone: string;
  role: string;
};

type MapForm = {
  mode: "existing" | "new";
  vendorId: string;
  name: string;
  phone: string;
  email: string;
  contacts: MapPoc[];
  keywords: string;
};

type DepartmentForm = {
  category: string;
  subcategory: string;
  contacts: MapPoc[];
  keywords: string;
};

const emptyPoc = (): MapPoc => ({
  name: "",
  email: "",
  phone: "",
  role: "",
});

const emptyMapForm = (): MapForm => ({
  mode: "existing",
  vendorId: "",
  name: "",
  phone: "",
  email: "",
  contacts: [emptyPoc()],
  keywords: "",
});

const emptyDepartmentForm = (): DepartmentForm => ({
  category: PRODUCT_CATEGORIES[0],
  subcategory: "",
  contacts: [emptyPoc()],
  keywords: "",
});

function apiError(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const fieldErrors = (value as { fieldErrors?: Record<string, string[]> }).fieldErrors;
    if (fieldErrors) return Object.values(fieldErrors).flat().join("; ");
  }
  return "Request failed";
}

function AdminVendorsPageInner() {
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const initialVendorId = searchParams.get("vendorId") || "";

  const [tab, setTab] = useState<"category" | "vendor">(
    initialVendorId ? "vendor" : "category"
  );
  const [taxonomy, setTaxonomy] = useState<TaxonomyCategory[]>([]);
  const [vendors, setVendors] = useState<VendorListItem[]>([]);
  const [mapSearchResults, setMapSearchResults] = useState<VendorListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [vendorSearching, setVendorSearching] = useState(false);
  const [mapSearching, setMapSearching] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>(
    PRODUCT_CATEGORIES[0]
  );
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(
    null
  );
  const [newSubcategory, setNewSubcategory] = useState("");
  const [addingSubcategory, setAddingSubcategory] = useState(false);
  const [categoryQuery, setCategoryQuery] = useState("");
  const [vendorQuery, setVendorQuery] = useState("");
  const [selectedVendorId, setSelectedVendorId] = useState(initialVendorId);
  const [selectedVendor, setSelectedVendor] = useState<VendorListItem | null>(
    null
  );

  const [mapOpen, setMapOpen] = useState(false);
  const [mapForm, setMapForm] = useState<MapForm>(emptyMapForm);
  const [mapSaving, setMapSaving] = useState(false);
  const [mapVendorSearch, setMapVendorSearch] = useState("");
  const [mapSearchOpen, setMapSearchOpen] = useState(false);
  const [mapVendorDetails, setMapVendorDetails] = useState<VendorListItem | null>(
    null
  );
  const [mapVendorLoading, setMapVendorLoading] = useState(false);

  const [deptOpen, setDeptOpen] = useState(false);
  const [deptForm, setDeptForm] = useState<DepartmentForm>(emptyDepartmentForm);
  const [deptSaving, setDeptSaving] = useState(false);

  const upsertVendorLocal = useCallback((vendor: VendorListItem) => {
    setVendors((current) => {
      const index = current.findIndex((row) => row.id === vendor.id);
      if (index < 0) return [vendor, ...current].slice(0, 80);
      const next = [...current];
      next[index] = vendor;
      return next;
    });
    setSelectedVendor((current) =>
      current?.id === vendor.id ? vendor : current
    );
  }, []);

  const applyVendorMappingLocal = useCallback(
    (payload: {
      category: string;
      subcategory: string;
      vendor: VendorListItem;
      mapping: {
        vendorId: string;
        vendorName: string;
        vendorCategoryId: string;
        active: boolean;
        phone: string;
        email: string;
        contacts: TaxonomyContact[];
      };
    }) => {
      const { category, subcategory, vendor, mapping } = payload;
      upsertVendorLocal(vendor);
      setTaxonomy((current) => {
        const next = current.map((row) => ({
          ...row,
          subcategories: row.subcategories.map((sub) => ({
            ...sub,
            vendors: [...sub.vendors],
          })),
        }));
        let categoryRow = next.find((row) => row.category === category);
        if (!categoryRow) {
          categoryRow = {
            category,
            subcategoryCount: 0,
            vendorCount: 0,
            subcategories: [],
          };
          next.push(categoryRow);
          next.sort((a, b) => a.category.localeCompare(b.category));
        }
        let subRow = categoryRow.subcategories.find(
          (sub) => sub.subcategory === subcategory
        );
        if (!subRow) {
          subRow = {
            subcategory,
            fromCatalog: false,
            fromAdmin: true,
            vendorCount: 0,
            vendors: [],
          };
          categoryRow.subcategories.push(subRow);
          categoryRow.subcategories.sort((a, b) =>
            a.subcategory.localeCompare(b.subcategory)
          );
        }
        const vendorEntry: TaxonomyVendor = {
          vendorId: mapping.vendorId,
          vendorName: mapping.vendorName,
          vendorCategoryId: mapping.vendorCategoryId,
          active: mapping.active,
          phone: mapping.phone,
          email: mapping.email,
          contacts: mapping.contacts,
        };
        const existingIndex = subRow.vendors.findIndex(
          (row) => row.vendorId === mapping.vendorId
        );
        if (existingIndex >= 0) subRow.vendors[existingIndex] = vendorEntry;
        else subRow.vendors.push(vendorEntry);
        subRow.vendorCount = subRow.vendors.length;
        categoryRow.subcategoryCount = categoryRow.subcategories.length;
        categoryRow.vendorCount = new Set(
          categoryRow.subcategories.flatMap((sub) =>
            sub.vendors.map((row) => row.vendorId)
          )
        ).size;
        return [...next];
      });
    },
    [upsertVendorLocal]
  );

  const loadTaxonomy = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const response = await fetch("/api/admin/taxonomy");
        const taxonomyData = await response.json();
        const categories = Array.isArray(taxonomyData.categories)
          ? (taxonomyData.categories as TaxonomyCategory[])
          : [];
        setTaxonomy(categories);
        if (categories.length > 0) {
          setSelectedCategory((current) =>
            categories.some((row) => row.category === current)
              ? current
              : categories[0].category
          );
        }
      } catch {
        if (!silent) toast("Could not load taxonomy", "error");
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [toast]
  );

  useEffect(() => {
    void loadTaxonomy();
  }, [loadTaxonomy]);

  useEffect(() => {
    if (initialVendorId) {
      setTab("vendor");
      setSelectedVendorId(initialVendorId);
    }
  }, [initialVendorId]);

  useEffect(() => {
    if (!selectedVendorId) {
      setSelectedVendor(null);
      return;
    }
    const cached = vendors.find((vendor) => vendor.id === selectedVendorId);
    if (cached && cached.categories) {
      setSelectedVendor(cached);
    }
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/vendors/${selectedVendorId}`);
        const data = await response.json();
        if (!response.ok || cancelled) return;
        const vendor = data as VendorListItem;
        if (!cancelled) {
          setSelectedVendor(vendor);
          upsertVendorLocal(vendor);
        }
      } catch {
        // keep cached vendor if present
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedVendorId, upsertVendorLocal]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (tab !== "vendor") return;
    const q = vendorQuery.trim();
    if (!q) {
      setVendorSearching(false);
      return;
    }
    const handle = window.setTimeout(() => {
      void (async () => {
        setVendorSearching(true);
        try {
          const params = new URLSearchParams({
            active: "true",
            light: "1",
            limit: "40",
            q,
          });
          const response = await fetch(`/api/vendors?${params}`);
          const data = await response.json();
          setVendors(Array.isArray(data) ? data : []);
        } catch {
          toast("Vendor search failed", "error");
        } finally {
          setVendorSearching(false);
        }
      })();
    }, 250);
    return () => window.clearTimeout(handle);
  }, [tab, vendorQuery, toast]);

  useEffect(() => {
    if (!mapSearchOpen) return;
    const q = mapVendorSearch.trim();
    if (q.length < 1) {
      setMapSearchResults([]);
      setMapSearching(false);
      return;
    }
    const handle = window.setTimeout(() => {
      void (async () => {
        setMapSearching(true);
        try {
          const params = new URLSearchParams({
            active: "true",
            light: "1",
            limit: "30",
            q,
          });
          const response = await fetch(`/api/vendors?${params}`);
          const data = await response.json();
          setMapSearchResults(Array.isArray(data) ? data : []);
        } catch {
          toast("Vendor search failed", "error");
        } finally {
          setMapSearching(false);
        }
      })();
    }, 220);
    return () => window.clearTimeout(handle);
  }, [mapSearchOpen, mapVendorSearch, toast]);

  const categoryRow = useMemo(
    () => taxonomy.find((row) => row.category === selectedCategory) || null,
    [taxonomy, selectedCategory]
  );

  const subcategoryRows = useMemo(() => {
    const fromApi = categoryRow?.subcategories || [];
    return [...fromApi].sort((a, b) => {
      if (!a.subcategory) return 1;
      if (!b.subcategory) return -1;
      return a.subcategory.localeCompare(b.subcategory);
    });
  }, [categoryRow]);

  const selectedSubRow = useMemo(
    () =>
      subcategoryRows.find((row) => row.subcategory === selectedSubcategory) ||
      null,
    [subcategoryRows, selectedSubcategory]
  );

  const filteredCategories = useMemo(() => {
    const q = categoryQuery.trim().toLowerCase();
    if (!q) return taxonomy;
    return taxonomy.filter(
      (row) =>
        row.category.toLowerCase().includes(q) ||
        row.subcategories.some((sub) =>
          sub.subcategory.toLowerCase().includes(q)
        )
    );
  }, [taxonomy, categoryQuery]);

  const filteredVendors = vendors;

  const subcategoryOptionsForDept = useMemo(() => {
    const category = deptForm.category;
    const row = taxonomy.find((item) => item.category === category);
    const fromApi = (row?.subcategories || []).map((sub) => sub.subcategory);
    return [...new Set(fromApi.filter(Boolean))].sort((a, b) =>
      a.localeCompare(b)
    );
  }, [taxonomy, deptForm.category]);

  const mapVendorMatches = mapSearchResults;

  function openMapModal(subcategory: string) {
    setSelectedSubcategory(subcategory);
    setMapForm(emptyMapForm());
    setMapVendorSearch("");
    setMapSearchOpen(false);
    setMapVendorDetails(null);
    setMapOpen(true);
  }

  async function selectExistingVendor(vendorId: string) {
    setMapVendorLoading(true);
    try {
      const response = await fetch(`/api/vendors/${vendorId}`);
      const data = await response.json();
      if (!response.ok) {
        toast(apiError(data.error) || "Could not load vendor details", "error");
        setMapVendorLoading(false);
        return;
      }
      const vendor = data as VendorListItem;
      const companyContacts = (vendor.contacts || []).filter(
        (contact) => !contact.vendorCategoryId
      );
      const seedContacts =
        companyContacts.length > 0
          ? companyContacts.map((contact) => ({
              name: contact.name || "",
              email: contact.email || "",
              phone: contact.phone || "",
              role: contact.role || "",
            }))
          : [
              {
                name: vendor.name || "",
                email: vendor.email || "",
                phone: vendor.phone || "",
                role: "",
              },
            ];
      setMapVendorDetails(vendor);
      setMapForm((current) => ({
        ...current,
        mode: "existing",
        vendorId: vendor.id,
        name: vendor.name,
        phone: vendor.phone || "",
        email: vendor.email || "",
        contacts: seedContacts.length > 0 ? seedContacts : [emptyPoc()],
      }));
      setMapVendorSearch(vendor.name);
    } catch {
      toast("Could not load vendor details", "error");
    }
    setMapVendorLoading(false);
  }

  function updateMapPoc(index: number, patch: Partial<MapPoc>) {
    setMapForm((current) => ({
      ...current,
      contacts: current.contacts.map((contact, contactIndex) =>
        contactIndex === index ? { ...contact, ...patch } : contact
      ),
    }));
  }

  function updateDeptPoc(index: number, patch: Partial<MapPoc>) {
    setDeptForm((current) => ({
      ...current,
      contacts: current.contacts.map((contact, contactIndex) =>
        contactIndex === index ? { ...contact, ...patch } : contact
      ),
    }));
  }

  async function submitMap(event: FormEvent) {
    event.preventDefault();
    if (!selectedCategory || selectedSubcategory == null) return;
    if (mapForm.mode === "existing" && !mapForm.vendorId) {
      toast("Search and select a vendor first", "error");
      return;
    }
    const contacts = mapForm.contacts
      .map((contact) => ({
        name: contact.name.trim(),
        email: contact.email.trim(),
        phone: contact.phone.trim(),
        role: contact.role.trim() || "Department POC",
      }))
      .filter((contact) => contact.name || contact.email || contact.phone);

    setMapSaving(true);
    const keywords = mapForm.keywords
      .split(/[|,;]/)
      .map((value) => value.trim())
      .filter(Boolean);
    const body =
      mapForm.mode === "existing"
        ? {
            vendorId: mapForm.vendorId,
            category: selectedCategory,
            subcategory: selectedSubcategory,
            keywords,
            contacts,
          }
        : {
            vendor: {
              name: mapForm.name,
              phone: mapForm.phone,
              email: mapForm.email,
            },
            category: selectedCategory,
            subcategory: selectedSubcategory,
            keywords,
            contacts:
              contacts.length > 0
                ? contacts
                : [
                    {
                      name: mapForm.name.trim(),
                      email: mapForm.email.trim(),
                      phone: mapForm.phone.trim(),
                      role: "Department POC",
                    },
                  ].filter((contact) => contact.name || contact.email || contact.phone),
          };

    const response = await fetch("/api/admin/vendor-maps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    setMapSaving(false);
    if (!response.ok) {
      toast(apiError(data.error), "error");
      return;
    }
    setMapOpen(false);
    if (data.vendor && data.mapping) {
      applyVendorMappingLocal({
        category: data.category || selectedCategory,
        subcategory: data.subcategory ?? selectedSubcategory,
        vendor: data.vendor as VendorListItem,
        mapping: data.mapping,
      });
    }
    toast(
      `Mapped ${data.vendor?.name || "vendor"} to ${selectedCategory}` +
        (data.contactCount
          ? ` · ${data.contactCount} POC${data.contactCount === 1 ? "" : "s"}`
          : "")
    );
  }

  async function unlinkVendor(
    vendorId: string,
    category: string,
    subcategory: string
  ) {
    if (!confirm("Unlink this vendor from the subcategory?")) return;
    const response = await fetch("/api/admin/vendor-maps", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vendorId, category, subcategory }),
    });
    const data = await response.json();
    if (!response.ok) {
      toast(apiError(data.error), "error");
      return;
    }
    setTaxonomy((current) =>
      current.map((row) => {
        if (row.category !== category) return row;
        const subcategories = row.subcategories.map((sub) => {
          if (sub.subcategory !== subcategory) return sub;
          const vendorsForSub = sub.vendors.filter(
            (vendor) => vendor.vendorId !== vendorId
          );
          return {
            ...sub,
            vendors: vendorsForSub,
            vendorCount: vendorsForSub.length,
          };
        });
        return {
          ...row,
          subcategories,
          vendorCount: new Set(
            subcategories.flatMap((sub) =>
              sub.vendors.map((vendor) => vendor.vendorId)
            )
          ).size,
        };
      })
    );
    if (selectedVendorId === vendorId) {
      setSelectedVendorId(vendorId);
      void fetch(`/api/vendors/${vendorId}`)
        .then((res) => res.json())
        .then((vendor) => {
          if (vendor?.id) {
            setSelectedVendor(vendor);
            upsertVendorLocal(vendor);
          }
        })
        .catch(() => undefined);
    }
    toast("Vendor unlinked");
  }

  async function removeSubcategory(subcategory: string) {
    const label = subcategory || "(category-level)";
    if (
      !confirm(
        `Remove subcategory "${label}" under ${selectedCategory}? This unmaps all vendors from it.`
      )
    ) {
      return;
    }
    const response = await fetch("/api/admin/taxonomy/subcategory", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: selectedCategory, subcategory }),
    });
    const data = await response.json();
    if (!response.ok) {
      toast(apiError(data.error), "error");
      return;
    }
    if (selectedSubcategory === subcategory) setSelectedSubcategory(null);
    setTaxonomy((current) =>
      current.map((row) => {
        if (row.category !== selectedCategory) return row;
        const subcategories = row.subcategories.filter(
          (sub) => sub.subcategory !== subcategory
        );
        return {
          ...row,
          subcategories,
          subcategoryCount: subcategories.length,
          vendorCount: new Set(
            subcategories.flatMap((sub) =>
              sub.vendors.map((vendor) => vendor.vendorId)
            )
          ).size,
        };
      })
    );
    toast(
      data.deleted || data.deletedAdmin
        ? `Removed subcategory ${label}`
        : `Cleared subcategory ${label}`
    );
  }

  async function addCustomSubcategory() {
    const value = newSubcategory.trim();
    if (!value || addingSubcategory) return;
    setAddingSubcategory(true);
    const response = await fetch("/api/admin/taxonomy/subcategory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category: selectedCategory,
        subcategory: value,
      }),
    });
    const data = await response.json();
    setAddingSubcategory(false);
    if (!response.ok) {
      toast(apiError(data.error) || "Could not save subcategory", "error");
      return;
    }
    setSelectedSubcategory(value);
    setNewSubcategory("");
    setTaxonomy((current) => {
      const next = current.map((row) => ({
        ...row,
        subcategories: [...row.subcategories],
      }));
      let categoryRow = next.find((row) => row.category === selectedCategory);
      if (!categoryRow) {
        categoryRow = {
          category: selectedCategory,
          subcategoryCount: 0,
          vendorCount: 0,
          subcategories: [],
        };
        next.push(categoryRow);
      }
      if (
        !categoryRow.subcategories.some((sub) => sub.subcategory === value)
      ) {
        categoryRow.subcategories.push({
          subcategory: value,
          fromCatalog: false,
          fromAdmin: true,
          vendorCount: 0,
          vendors: [],
        });
        categoryRow.subcategories.sort((a, b) =>
          a.subcategory.localeCompare(b.subcategory)
        );
        categoryRow.subcategoryCount = categoryRow.subcategories.length;
      }
      return [...next];
    });
    toast(`Saved subcategory “${value}” under ${selectedCategory}`);
  }

  async function submitDepartment(event: FormEvent) {
    event.preventDefault();
    if (!selectedVendorId) return;
    setDeptSaving(true);
    const keywords = deptForm.keywords
      .split(/[|,;]/)
      .map((value) => value.trim())
      .filter(Boolean);
    const contacts = deptForm.contacts
      .map((contact) => ({
        name: contact.name.trim(),
        email: contact.email.trim(),
        phone: contact.phone.trim(),
        role: contact.role.trim() || "Department POC",
      }))
      .filter((contact) => contact.name || contact.email || contact.phone);
    const response = await fetch("/api/admin/vendor-maps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vendorId: selectedVendorId,
        category: deptForm.category,
        subcategory: deptForm.subcategory.trim(),
        keywords,
        contacts,
      }),
    });
    const data = await response.json();
    setDeptSaving(false);
    if (!response.ok) {
      toast(apiError(data.error), "error");
      return;
    }
    setDeptOpen(false);
    if (data.vendor && data.mapping) {
      applyVendorMappingLocal({
        category: data.category || deptForm.category,
        subcategory: data.subcategory ?? deptForm.subcategory.trim(),
        vendor: data.vendor as VendorListItem,
        mapping: data.mapping,
      });
    }
    toast(
      `Added department ${deptForm.category}${
        deptForm.subcategory ? ` / ${deptForm.subcategory}` : ""
      }`
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-mid-green">
            Admin
          </p>
          <h1 className="text-2xl font-semibold">Vendor mapping</h1>
          <p className="mt-1 text-sm text-mid-green">
            Map vendors to category / subcategory with department POCs. Mapped
            vendors also appear in{" "}
            <Link href="/vendors" className="underline underline-offset-2">
              Vendors
            </Link>
            .
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-light-green/40 bg-white/50 p-1 text-sm">
          <button
            type="button"
            onClick={() => setTab("category")}
            className={`rounded-md px-3 py-1.5 ${
              tab === "category"
                ? "bg-mid-green text-background"
                : "text-dark-primary hover:bg-light-green/20"
            }`}
          >
            By category
          </button>
          <button
            type="button"
            onClick={() => setTab("vendor")}
            className={`rounded-md px-3 py-1.5 ${
              tab === "vendor"
                ? "bg-mid-green text-background"
                : "text-dark-primary hover:bg-light-green/20"
            }`}
          >
            By vendor
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-mid-green">Loading taxonomy…</p>
      ) : tab === "category" ? (
        <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="rounded-xl bg-white/40 p-3 shadow-[0_4px_20px_rgba(11,43,38,0.06)]">
            <div className="relative mb-2">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-mid-green" />
              <input
                value={categoryQuery}
                onChange={(event) => setCategoryQuery(event.target.value)}
                placeholder="Filter categories"
                className="w-full rounded-lg border border-light-green/40 bg-white/70 py-1.5 pl-8 pr-2 text-sm outline-none focus:border-mid-green"
              />
            </div>
            <div className="max-h-[70vh] space-y-0.5 overflow-y-auto">
              {filteredCategories.map((row) => (
                <button
                  key={row.category}
                  type="button"
                  onClick={() => {
                    setSelectedCategory(row.category);
                    setSelectedSubcategory(null);
                  }}
                  className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm ${
                    selectedCategory === row.category
                      ? "bg-mid-green/15 font-medium text-dark-primary"
                      : "text-dark-primary/90 hover:bg-light-green/20"
                  }`}
                >
                  <span className="truncate pr-2">{row.category}</span>
                  <span className="shrink-0 text-[11px] text-mid-green">
                    {row.vendorCount}
                  </span>
                </button>
              ))}
            </div>
          </aside>

          <section className="space-y-4 rounded-xl bg-white/40 p-4 shadow-[0_4px_20px_rgba(11,43,38,0.06)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{selectedCategory}</h2>
                <p className="text-xs text-mid-green">
                  {subcategoryRows.length} subcategories ·{" "}
                  {categoryRow?.vendorCount || 0} mapped vendors
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={newSubcategory}
                  onChange={(event) => setNewSubcategory(event.target.value)}
                  placeholder="New subcategory"
                  className="rounded-lg border border-light-green/40 bg-white/70 px-3 py-1.5 text-sm outline-none focus:border-mid-green"
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void addCustomSubcategory();
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => void addCustomSubcategory()}
                  disabled={addingSubcategory || !newSubcategory.trim()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-mid-green px-3 py-1.5 text-sm font-medium text-background hover:bg-dark-secondary disabled:opacity-60"
                >
                  <Plus className="h-3.5 w-3.5" strokeWidth={1.6} />
                  {addingSubcategory ? "Saving…" : "Add subcategory"}
                </button>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {subcategoryRows.length === 0 ? (
                <p className="text-sm text-mid-green md:col-span-2 xl:col-span-3">
                  No subcategories yet. Add one above, or map vendors after
                  products create catalog subcategories.
                </p>
              ) : (
                subcategoryRows.map((row) => {
                  const active = selectedSubcategory === row.subcategory;
                  return (
                    <button
                      key={row.subcategory || "__empty__"}
                      type="button"
                      onClick={() => setSelectedSubcategory(row.subcategory)}
                      className={`rounded-xl border px-3 py-3 text-left transition ${
                        active
                          ? "border-mid-green bg-mid-green/10"
                          : "border-light-green/40 bg-white/50 hover:border-mid-green/50"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium">
                          {row.subcategory || "(category-level)"}
                        </p>
                        <span className="rounded bg-light-green/30 px-1.5 py-0.5 text-[10px] text-mid-green">
                          {row.fromCatalog
                            ? "Catalog"
                            : row.fromAdmin
                              ? "Admin"
                              : "Mapped"}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-mid-green">
                        {row.vendorCount} vendor{row.vendorCount === 1 ? "" : "s"}
                      </p>
                    </button>
                  );
                })
              )}
            </div>

            {selectedSubRow ? (
              <div className="rounded-xl border border-light-green/40 bg-white/60 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">
                      {selectedSubRow.subcategory || "(category-level)"}
                    </h3>
                    <p className="text-xs text-mid-green">
                      Vendors mapped to this subcategory
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => openMapModal(selectedSubRow.subcategory)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-mid-green px-3 py-1.5 text-sm font-medium text-background hover:bg-dark-secondary"
                    >
                      <UserPlus className="h-3.5 w-3.5" strokeWidth={1.6} />
                      Add vendor
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void removeSubcategory(selectedSubRow.subcategory)
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-sm text-red-800 hover:bg-red-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={1.6} />
                      Remove subcategory
                    </button>
                  </div>
                </div>

                <div className="mt-4 overflow-hidden rounded-lg border border-light-green/30">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-dark-secondary/5 text-mid-green">
                      <tr>
                        <th className="px-3 py-2 font-medium">Vendor</th>
                        <th className="px-3 py-2 font-medium">Department POCs</th>
                        <th className="px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {selectedSubRow.vendors.length === 0 ? (
                        <tr>
                          <td
                            colSpan={3}
                            className="px-3 py-6 text-center text-mid-green"
                          >
                            No vendors mapped yet
                          </td>
                        </tr>
                      ) : (
                        selectedSubRow.vendors.map((vendor) => {
                          return (
                            <tr
                              key={vendor.vendorCategoryId}
                              className="border-t border-light-green/20"
                            >
                              <td className="px-3 py-2">
                                <div className="font-medium">
                                  {vendor.vendorName}
                                </div>
                                <div className="text-xs text-mid-green">
                                  {vendor.phone || vendor.email || "—"}
                                </div>
                              </td>
                              <td className="px-3 py-2">
                                {vendor.contacts.length > 0 ? (
                                  <ul className="space-y-1.5">
                                    {vendor.contacts.map((poc) => (
                                      <li key={poc.id}>
                                        <div>
                                          {poc.name || "—"}
                                          {poc.role ? (
                                            <span className="text-xs text-mid-green">
                                              {" "}
                                              · {poc.role}
                                            </span>
                                          ) : null}
                                        </div>
                                        <div className="text-xs text-mid-green">
                                          {[poc.email, poc.phone]
                                            .filter(Boolean)
                                            .join(" · ") || "—"}
                                        </div>
                                      </li>
                                    ))}
                                  </ul>
                                ) : (
                                  <span className="text-mid-green">—</span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-right">
                                <button
                                  type="button"
                                  onClick={() =>
                                    void unlinkVendor(
                                      vendor.vendorId,
                                      selectedCategory,
                                      selectedSubRow.subcategory
                                    )
                                  }
                                  className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-mid-green hover:bg-light-green/30"
                                  title="Unlink vendor"
                                >
                                  <Link2Off
                                    className="h-3.5 w-3.5"
                                    strokeWidth={1.6}
                                  />
                                  Unlink
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </section>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="rounded-xl bg-white/40 p-3 shadow-[0_4px_20px_rgba(11,43,38,0.06)]">
            <div className="relative mb-2">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-mid-green" />
              <input
                value={vendorQuery}
                onChange={(event) => setVendorQuery(event.target.value)}
                placeholder="Search vendors"
                className="w-full rounded-lg border border-light-green/40 bg-white/70 py-1.5 pl-8 pr-2 text-sm outline-none focus:border-mid-green"
              />
            </div>
            <div className="max-h-[70vh] space-y-0.5 overflow-y-auto">
              {!vendorQuery.trim() ? (
                <p className="px-2 py-6 text-center text-xs text-mid-green">
                  Type to search vendors
                </p>
              ) : vendorSearching ? (
                <p className="px-2 py-6 text-center text-xs text-mid-green">
                  Searching…
                </p>
              ) : filteredVendors.length === 0 ? (
                <p className="px-2 py-6 text-center text-xs text-mid-green">
                  No vendors match
                </p>
              ) : (
                filteredVendors.map((vendor) => (
                  <button
                    key={vendor.id}
                    type="button"
                    onClick={() => setSelectedVendorId(vendor.id)}
                    className={`flex w-full flex-col rounded-lg px-2.5 py-2 text-left text-sm ${
                      selectedVendorId === vendor.id
                        ? "bg-mid-green/15 font-medium text-dark-primary"
                        : "text-dark-primary/90 hover:bg-light-green/20"
                    }`}
                  >
                    <span className="truncate">{vendor.name}</span>
                    <span className="text-[11px] font-normal text-mid-green">
                      {vendor.categories?.length || 0} department
                      {(vendor.categories?.length || 0) === 1 ? "" : "s"}
                    </span>
                  </button>
                ))
              )}
            </div>
          </aside>

          <section className="rounded-xl bg-white/40 p-4 shadow-[0_4px_20px_rgba(11,43,38,0.06)]">
            {!selectedVendor ? (
              <p className="text-sm text-mid-green">
                Select a vendor to manage departments and POCs.
              </p>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">
                      {selectedVendor.name}
                    </h2>
                    <p className="text-xs text-mid-green">
                      {[selectedVendor.phone, selectedVendor.email]
                        .filter(Boolean)
                        .join(" · ") || "No company contact"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setDeptForm(emptyDepartmentForm());
                      setDeptOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-mid-green px-3 py-1.5 text-sm font-medium text-background hover:bg-dark-secondary"
                  >
                    <Plus className="h-3.5 w-3.5" strokeWidth={1.6} />
                    Add department
                  </button>
                </div>

                <div className="overflow-hidden rounded-lg border border-light-green/30">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-dark-secondary/5 text-mid-green">
                      <tr>
                        <th className="px-3 py-2 font-medium">Department</th>
                        <th className="px-3 py-2 font-medium">POC</th>
                        <th className="px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {selectedVendor.categories.length === 0 ? (
                        <tr>
                          <td
                            colSpan={3}
                            className="px-3 py-6 text-center text-mid-green"
                          >
                            No departments yet
                          </td>
                        </tr>
                      ) : (
                        selectedVendor.categories.map((department) => {
                          const pocs = selectedVendor.contacts.filter(
                            (contact) =>
                              contact.vendorCategoryId === department.id ||
                              (contact.category === department.category &&
                                (contact.subcategory || "") ===
                                  (department.subcategory || ""))
                          );
                          return (
                            <tr
                              key={`${department.category}-${department.subcategory}`}
                              className="border-t border-light-green/20"
                            >
                              <td className="px-3 py-2">
                                <div className="font-medium">
                                  {department.category}
                                  {department.subcategory
                                    ? ` / ${department.subcategory}`
                                    : ""}
                                </div>
                                {department.keywords?.length ? (
                                  <div className="text-[11px] text-mid-green">
                                    Keywords: {department.keywords.join(", ")}
                                  </div>
                                ) : null}
                              </td>
                              <td className="px-3 py-2">
                                {pocs.length > 0 ? (
                                  <ul className="space-y-1.5">
                                    {pocs.map((poc) => (
                                      <li
                                        key={
                                          poc.id ||
                                          `${poc.name}-${poc.email}-${poc.phone}`
                                        }
                                      >
                                        <div>
                                          {poc.name || "—"}
                                          {poc.role ? (
                                            <span className="text-xs text-mid-green">
                                              {" "}
                                              · {poc.role}
                                            </span>
                                          ) : null}
                                        </div>
                                        <div className="text-xs text-mid-green">
                                          {[poc.email, poc.phone]
                                            .filter(Boolean)
                                            .join(" · ") || "—"}
                                        </div>
                                      </li>
                                    ))}
                                  </ul>
                                ) : (
                                  <span className="text-mid-green">
                                    Company-level only
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-right">
                                <button
                                  type="button"
                                  onClick={() =>
                                    void unlinkVendor(
                                      selectedVendor.id,
                                      department.category,
                                      department.subcategory
                                    )
                                  }
                                  className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-mid-green hover:bg-light-green/30"
                                >
                                  <Link2Off
                                    className="h-3.5 w-3.5"
                                    strokeWidth={1.6}
                                  />
                                  Remove
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-mid-green">
                    Company-level POCs
                  </h3>
                  <ul className="mt-2 space-y-1 text-sm">
                    {selectedVendor.contacts
                      .filter((contact) => !contact.vendorCategoryId)
                      .map((contact) => (
                        <li key={contact.id || `${contact.email}-${contact.phone}`}>
                          {contact.name || "POC"}
                          {contact.role ? ` (${contact.role})` : ""} —{" "}
                          {[contact.email, contact.phone]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                        </li>
                      ))}
                    {selectedVendor.contacts.filter(
                      (contact) => !contact.vendorCategoryId
                    ).length === 0 ? (
                      <li className="text-mid-green">None</li>
                    ) : null}
                  </ul>
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {mapOpen && selectedSubcategory != null ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-dark-primary/50 p-3 backdrop-blur-[2px]">
          <form
            onSubmit={submitMap}
            className="flex max-h-[88vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-dark-primary/8 bg-background shadow-[0_20px_60px_rgba(11,43,38,0.28)]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="map-vendor-title"
          >
            <div className="shrink-0 border-b border-dark-primary/8 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2
                    id="map-vendor-title"
                    className="truncate text-base font-semibold text-dark-primary"
                  >
                    Add vendor
                    <span className="ml-2 text-sm font-normal text-mid-green">
                      {selectedCategory}
                      {selectedSubcategory ? ` / ${selectedSubcategory}` : ""}
                    </span>
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setMapOpen(false)}
                  className="rounded-md p-1.5 text-mid-green hover:bg-dark-primary/5"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" strokeWidth={1.6} />
                </button>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-0.5 rounded-lg bg-dark-primary/[0.04] p-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setMapForm((current) => ({
                      ...emptyMapForm(),
                      mode: "existing",
                      keywords: current.keywords,
                    }));
                    setMapVendorDetails(null);
                    setMapVendorSearch("");
                    setMapSearchOpen(false);
                  }}
                  className={`rounded-md px-2 py-1.5 text-xs font-medium ${
                    mapForm.mode === "existing"
                      ? "bg-white text-dark-primary shadow-sm"
                      : "text-mid-green"
                  }`}
                >
                  Existing
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMapForm((current) => ({
                      ...emptyMapForm(),
                      mode: "new",
                      keywords: current.keywords,
                    }));
                    setMapVendorDetails(null);
                    setMapVendorSearch("");
                    setMapSearchOpen(false);
                  }}
                  className={`rounded-md px-2 py-1.5 text-xs font-medium ${
                    mapForm.mode === "new"
                      ? "bg-white text-dark-primary shadow-sm"
                      : "text-mid-green"
                  }`}
                >
                  New vendor
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
              {mapForm.mode === "existing" ? (
                <section className="space-y-2">
                  {!mapForm.vendorId && !mapSearchOpen ? (
                    <button
                      type="button"
                      onClick={() => setMapSearchOpen(true)}
                      className="flex w-full items-center gap-2 rounded-lg border border-dark-primary/10 bg-white px-3 py-2 text-left text-sm text-mid-green hover:border-mid-green/40"
                    >
                      <Search className="h-3.5 w-3.5" strokeWidth={1.6} />
                      Search vendor…
                    </button>
                  ) : null}

                  {!mapForm.vendorId && mapSearchOpen ? (
                    <div className="space-y-1.5">
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-mid-green" />
                        <input
                          autoFocus
                          value={mapVendorSearch}
                          onChange={(event) => setMapVendorSearch(event.target.value)}
                          placeholder="Type name, phone, or email…"
                          className="w-full rounded-lg border border-dark-primary/10 bg-white py-2 pl-8 pr-8 text-sm outline-none focus:border-mid-green"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setMapSearchOpen(false);
                            setMapVendorSearch("");
                          }}
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-mid-green hover:bg-dark-primary/5"
                          aria-label="Close search"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="max-h-36 overflow-y-auto rounded-lg border border-dark-primary/8 bg-white">
                        {mapSearching ? (
                          <p className="px-3 py-4 text-center text-xs text-mid-green">
                            Searching…
                          </p>
                        ) : mapVendorMatches.length === 0 ? (
                          <p className="px-3 py-4 text-center text-xs text-mid-green">
                            {mapVendorSearch.trim()
                              ? "No matches"
                              : "Start typing to search"}
                          </p>
                        ) : (
                          mapVendorMatches.map((vendor) => (
                            <button
                              key={vendor.id}
                              type="button"
                              onClick={() => {
                                setMapSearchOpen(false);
                                void selectExistingVendor(vendor.id);
                              }}
                              className="flex w-full flex-col border-b border-dark-primary/5 px-3 py-2 text-left last:border-b-0 hover:bg-mid-green/8"
                            >
                              <span className="truncate text-sm font-medium">
                                {vendor.name}
                              </span>
                              <span className="truncate text-[11px] text-mid-green">
                                {[vendor.phone, vendor.email]
                                  .filter(Boolean)
                                  .join(" · ") || "No contact"}
                              </span>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  ) : null}

                  {mapVendorLoading ? (
                    <p className="py-2 text-center text-xs text-mid-green">
                      Loading…
                    </p>
                  ) : null}

                  {mapVendorDetails && mapForm.vendorId ? (
                    <div className="flex items-center justify-between gap-2 rounded-lg border border-mid-green/25 bg-mid-green/5 px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {mapVendorDetails.name}
                        </p>
                        <p className="truncate text-[11px] text-mid-green">
                          {[mapVendorDetails.phone, mapVendorDetails.email]
                            .filter(Boolean)
                            .join(" · ") || "No company contact"}
                          {mapVendorDetails.categories.length > 0
                            ? ` · ${mapVendorDetails.categories.length} dept`
                            : ""}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setMapForm((current) => ({
                            ...emptyMapForm(),
                            mode: "existing",
                            keywords: current.keywords,
                          }));
                          setMapVendorDetails(null);
                          setMapVendorSearch("");
                          setMapSearchOpen(true);
                        }}
                        className="shrink-0 text-xs text-mid-green underline"
                      >
                        Change
                      </button>
                    </div>
                  ) : null}
                </section>
              ) : (
                <section className="grid gap-2 sm:grid-cols-3">
                  <label className="block text-xs sm:col-span-3">
                    <span className="text-mid-green">Vendor name</span>
                    <input
                      required
                      value={mapForm.name}
                      onChange={(event) =>
                        setMapForm((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                      className="mt-1 w-full rounded-lg border border-dark-primary/10 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-mid-green"
                    />
                  </label>
                  <label className="block text-xs">
                    <span className="text-mid-green">Phone</span>
                    <input
                      value={mapForm.phone}
                      onChange={(event) =>
                        setMapForm((current) => ({
                          ...current,
                          phone: event.target.value,
                        }))
                      }
                      className="mt-1 w-full rounded-lg border border-dark-primary/10 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-mid-green"
                    />
                  </label>
                  <label className="block text-xs sm:col-span-2">
                    <span className="text-mid-green">Email</span>
                    <input
                      type="email"
                      value={mapForm.email}
                      onChange={(event) =>
                        setMapForm((current) => ({
                          ...current,
                          email: event.target.value,
                        }))
                      }
                      className="mt-1 w-full rounded-lg border border-dark-primary/10 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-mid-green"
                    />
                  </label>
                </section>
              )}

              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="inline-flex items-center gap-1 text-xs font-medium text-dark-primary">
                    <Users className="h-3.5 w-3.5 text-mid-green" strokeWidth={1.6} />
                    Department POCs
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      setMapForm((current) => ({
                        ...current,
                        contacts: [...current.contacts, emptyPoc()],
                      }))
                    }
                    className="inline-flex items-center gap-1 text-xs font-medium text-mid-green hover:text-dark-primary"
                  >
                    <Plus className="h-3 w-3" strokeWidth={1.6} />
                    Add POC
                  </button>
                </div>
                {mapForm.contacts.map((contact, index) => (
                  <div
                    key={index}
                    className="rounded-lg border border-dark-primary/8 bg-white p-2.5"
                  >
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="text-[10px] font-medium uppercase tracking-wide text-mid-green">
                        POC {index + 1}
                      </span>
                      {mapForm.contacts.length > 1 ? (
                        <button
                          type="button"
                          onClick={() =>
                            setMapForm((current) => ({
                              ...current,
                              contacts: current.contacts.filter(
                                (_, contactIndex) => contactIndex !== index
                              ),
                            }))
                          }
                          className="text-[11px] text-mid-green hover:text-red-700"
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <input
                        value={contact.name}
                        onChange={(event) =>
                          updateMapPoc(index, { name: event.target.value })
                        }
                        placeholder="Name"
                        className="rounded-md border border-dark-primary/10 bg-background px-2 py-1.5 text-sm outline-none focus:border-mid-green"
                      />
                      <input
                        value={contact.role}
                        onChange={(event) =>
                          updateMapPoc(index, { role: event.target.value })
                        }
                        placeholder="Role"
                        className="rounded-md border border-dark-primary/10 bg-background px-2 py-1.5 text-sm outline-none focus:border-mid-green"
                      />
                      <input
                        type="email"
                        value={contact.email}
                        onChange={(event) =>
                          updateMapPoc(index, { email: event.target.value })
                        }
                        placeholder="Email"
                        className="rounded-md border border-dark-primary/10 bg-background px-2 py-1.5 text-sm outline-none focus:border-mid-green"
                      />
                      <input
                        value={contact.phone}
                        onChange={(event) =>
                          updateMapPoc(index, { phone: event.target.value })
                        }
                        placeholder="Phone"
                        className="rounded-md border border-dark-primary/10 bg-background px-2 py-1.5 text-sm outline-none focus:border-mid-green"
                      />
                    </div>
                  </div>
                ))}
                <input
                  value={mapForm.keywords}
                  onChange={(event) =>
                    setMapForm((current) => ({
                      ...current,
                      keywords: event.target.value,
                    }))
                  }
                  placeholder="Keywords (optional)"
                  className="w-full rounded-lg border border-dark-primary/10 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-mid-green"
                />
              </section>
            </div>

            <div className="flex shrink-0 justify-end gap-2 border-t border-dark-primary/8 px-4 py-2.5">
              <button
                type="button"
                onClick={() => setMapOpen(false)}
                className="rounded-lg px-3 py-1.5 text-sm text-mid-green hover:bg-dark-primary/5"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={
                  mapSaving ||
                  mapVendorLoading ||
                  (mapForm.mode === "existing" && !mapForm.vendorId)
                }
                className="rounded-lg bg-mid-green px-3 py-1.5 text-sm font-medium text-background hover:bg-dark-secondary disabled:opacity-60"
              >
                {mapSaving ? "Saving…" : "Save mapping"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {deptOpen && selectedVendor ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-dark-primary/50 p-4 backdrop-blur-[2px]">
          <form
            onSubmit={submitDepartment}
            className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-dark-primary/8 bg-background shadow-[0_24px_80px_rgba(11,43,38,0.28)]"
            role="dialog"
            aria-modal="true"
          >
            <div className="shrink-0 border-b border-dark-primary/8 px-6 py-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-mid-green">
                    By vendor
                  </p>
                  <h2 className="mt-1 text-xl font-semibold tracking-tight">
                    Add department
                  </h2>
                  <p className="mt-1 text-sm text-mid-green">{selectedVendor.name}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setDeptOpen(false)}
                  className="rounded-lg p-2 text-mid-green transition hover:bg-dark-primary/5"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" strokeWidth={1.6} />
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="text-mid-green">Category</span>
                  <select
                    value={deptForm.category}
                    onChange={(event) =>
                      setDeptForm((current) => ({
                        ...current,
                        category: event.target.value,
                        subcategory: "",
                      }))
                    }
                    className="mt-1.5 w-full rounded-xl border border-dark-primary/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-mid-green focus:ring-2 focus:ring-mid-green/20"
                  >
                    {PRODUCT_CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="text-mid-green">Subcategory</span>
                  <input
                    list={`subcats-${deptForm.category}`}
                    value={deptForm.subcategory}
                    onChange={(event) =>
                      setDeptForm((current) => ({
                        ...current,
                        subcategory: event.target.value,
                      }))
                    }
                    placeholder="Pick or type a subcategory"
                    className="mt-1.5 w-full rounded-xl border border-dark-primary/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-mid-green focus:ring-2 focus:ring-mid-green/20"
                  />
                  <datalist id={`subcats-${deptForm.category}`}>
                    {subcategoryOptionsForDept.map((subcategory) => (
                      <option key={subcategory} value={subcategory} />
                    ))}
                  </datalist>
                </label>
              </div>

              <section className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-dark-primary">
                      Department POCs
                    </p>
                    <p className="mt-0.5 text-xs text-mid-green">
                      Multiple contacts allowed for this product line
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setDeptForm((current) => ({
                        ...current,
                        contacts: [...current.contacts, emptyPoc()],
                      }))
                    }
                    className="inline-flex items-center gap-1.5 rounded-lg border border-dark-primary/10 bg-white px-2.5 py-1.5 text-xs font-medium hover:bg-mid-green/10"
                  >
                    <Plus className="h-3.5 w-3.5" strokeWidth={1.6} />
                    Add POC
                  </button>
                </div>
                {deptForm.contacts.map((contact, index) => (
                  <div
                    key={index}
                    className="rounded-xl border border-dark-primary/8 bg-white p-4"
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-xs font-medium uppercase tracking-wide text-mid-green">
                        POC {index + 1}
                      </p>
                      {deptForm.contacts.length > 1 ? (
                        <button
                          type="button"
                          onClick={() =>
                            setDeptForm((current) => ({
                              ...current,
                              contacts: current.contacts.filter(
                                (_, contactIndex) => contactIndex !== index
                              ),
                            }))
                          }
                          className="text-xs text-mid-green hover:text-red-700"
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block text-sm">
                        <span className="text-mid-green">Name</span>
                        <input
                          value={contact.name}
                          onChange={(event) =>
                            updateDeptPoc(index, { name: event.target.value })
                          }
                          className="mt-1.5 w-full rounded-xl border border-dark-primary/10 bg-background px-3 py-2 text-sm outline-none focus:border-mid-green focus:ring-2 focus:ring-mid-green/20"
                        />
                      </label>
                      <label className="block text-sm">
                        <span className="text-mid-green">Role</span>
                        <input
                          value={contact.role}
                          onChange={(event) =>
                            updateDeptPoc(index, { role: event.target.value })
                          }
                          className="mt-1.5 w-full rounded-xl border border-dark-primary/10 bg-background px-3 py-2 text-sm outline-none focus:border-mid-green focus:ring-2 focus:ring-mid-green/20"
                        />
                      </label>
                      <label className="block text-sm">
                        <span className="text-mid-green">Email</span>
                        <input
                          type="email"
                          value={contact.email}
                          onChange={(event) =>
                            updateDeptPoc(index, { email: event.target.value })
                          }
                          className="mt-1.5 w-full rounded-xl border border-dark-primary/10 bg-background px-3 py-2 text-sm outline-none focus:border-mid-green focus:ring-2 focus:ring-mid-green/20"
                        />
                      </label>
                      <label className="block text-sm">
                        <span className="text-mid-green">Phone</span>
                        <input
                          value={contact.phone}
                          onChange={(event) =>
                            updateDeptPoc(index, { phone: event.target.value })
                          }
                          className="mt-1.5 w-full rounded-xl border border-dark-primary/10 bg-background px-3 py-2 text-sm outline-none focus:border-mid-green focus:ring-2 focus:ring-mid-green/20"
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </section>

              <label className="block text-sm">
                <span className="text-mid-green">Keywords</span>
                <input
                  value={deptForm.keywords}
                  onChange={(event) =>
                    setDeptForm((current) => ({
                      ...current,
                      keywords: event.target.value,
                    }))
                  }
                  className="mt-1.5 w-full rounded-xl border border-dark-primary/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-mid-green focus:ring-2 focus:ring-mid-green/20"
                />
              </label>
            </div>

            <div className="flex shrink-0 justify-end gap-2 border-t border-dark-primary/8 bg-dark-primary/[0.02] px-6 py-4">
              <button
                type="button"
                onClick={() => setDeptOpen(false)}
                className="rounded-xl px-4 py-2.5 text-sm font-medium text-mid-green hover:bg-dark-primary/5"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={deptSaving}
                className="rounded-xl bg-mid-green px-4 py-2.5 text-sm font-medium text-background hover:bg-dark-secondary disabled:opacity-60"
              >
                {deptSaving ? "Saving…" : "Save department"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

export default function AdminVendorsPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6 text-sm text-mid-green">Loading admin mapping…</div>
      }
    >
      <AdminVendorsPageInner />
    </Suspense>
  );
}
