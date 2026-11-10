"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  FormEvent,
  ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
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
  /** Selected existing vendors to map in one save. */
  vendorIds: string[];
  /** POCs keyed by vendor id (existing mode). */
  vendorContacts: Record<string, MapPoc[]>;
  name: string;
  phone: string;
  email: string;
  /** POCs for new-vendor mode. */
  contacts: MapPoc[];
  keywords: string;
};

type CategoryAssignForm = {
  category: string;
  subcategories: string[];
  /** Keywords keyed by subcategory name. */
  subcategoryKeywords: Record<string, string>;
  contacts: MapPoc[];
};

const emptyPoc = (): MapPoc => ({
  name: "",
  email: "",
  phone: "",
  role: "",
});

const emptyMapForm = (): MapForm => ({
  mode: "existing",
  vendorIds: [],
  vendorContacts: {},
  name: "",
  phone: "",
  email: "",
  contacts: [emptyPoc()],
  keywords: "",
});

function normalizeMapContacts(contacts: MapPoc[]) {
  return contacts
    .map((contact) => ({
      name: contact.name.trim(),
      email: contact.email.trim(),
      phone: contact.phone.trim(),
      role: contact.role.trim() || "Department POC",
    }))
    .filter((contact) => contact.name || contact.email || contact.phone);
}

function seedVendorMapContacts(vendor: VendorListItem): MapPoc[] {
  const companyContacts = (vendor.contacts || []).filter(
    (contact) => !contact.vendorCategoryId
  );
  if (companyContacts.length > 0) {
    return companyContacts.map((contact) => ({
      name: contact.name || "",
      email: contact.email || "",
      phone: contact.phone || "",
      role: contact.role || "",
    }));
  }
  return [
    {
      name: vendor.name || "",
      email: vendor.email || "",
      phone: vendor.phone || "",
      role: "",
    },
  ];
}

const emptyCategoryAssignForm = (): CategoryAssignForm => ({
  category: PRODUCT_CATEGORIES[0],
  subcategories: [],
  subcategoryKeywords: {},
  contacts: [emptyPoc()],
});

/** Prefill Assign with this vendor's existing maps under a category. */
function assignFormFromVendor(
  vendor: VendorListItem | null | undefined,
  category: string
): CategoryAssignForm {
  const mapped = (vendor?.categories || []).filter(
    (row) => row.category === category
  );
  const subcategories: string[] = [];
  const subcategoryKeywords: Record<string, string> = {};
  for (const row of mapped) {
    const subcategory = row.subcategory || "";
    if (!subcategories.includes(subcategory)) {
      subcategories.push(subcategory);
    }
    subcategoryKeywords[subcategory] = (row.keywords || []).join(", ");
  }
  return {
    category,
    subcategories,
    subcategoryKeywords,
    contacts: [emptyPoc()],
  };
}

function parseKeywordInput(value: string) {
  return value
    .split(/[|,;]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function MappingPanel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-light-green/25 bg-white/80 shadow-[0_8px_28px_rgba(11,43,38,0.06)] backdrop-blur-sm ${className}`}
    >
      {children}
    </div>
  );
}

function MappingEmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-light-green/40 bg-background/50 px-4 py-8 text-center text-sm text-mid-green">
      {children}
    </div>
  );
}

function pocKey(contact: {
  name?: string;
  email?: string;
  phone?: string;
  id?: string;
}) {
  if (contact.id) return `id:${contact.id}`;
  return `${(contact.email || "").toLowerCase()}|${contact.phone || ""}|${(
    contact.name || ""
  ).toLowerCase()}`;
}

function apiError(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const fieldErrors = (value as { fieldErrors?: Record<string, string[]> }).fieldErrors;
    if (fieldErrors) return Object.values(fieldErrors).flat().join("; ");
  }
  return "Request failed";
}

function AdminVendorsPageInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const initialVendorId = searchParams.get("vendorId") || "";
  const initialTab =
    searchParams.get("tab") === "vendor" || initialVendorId
      ? "vendor"
      : "category";

  const [tab, setTab] = useState<"category" | "vendor">(initialTab);

  const syncVendorMappingUrl = useCallback(
    (next: { tab: "category" | "vendor"; vendorId?: string }) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next.tab === "vendor") {
        params.set("tab", "vendor");
      } else {
        params.delete("tab");
      }
      const vendorId = (next.vendorId ?? "").trim();
      if (next.tab === "vendor" && vendorId) {
        params.set("vendorId", vendorId);
      } else {
        params.delete("vendorId");
      }
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    },
    [pathname, router, searchParams]
  );
  const [taxonomy, setTaxonomy] = useState<TaxonomyCategory[]>([]);
  const [vendors, setVendors] = useState<VendorListItem[]>([]);
  const [mapSearchResults, setMapSearchResults] = useState<VendorListItem[]>([]);
  const [loading, setLoading] = useState(initialTab === "category");
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
  const [mapSelectedVendors, setMapSelectedVendors] = useState<VendorListItem[]>(
    []
  );
  const [mapVendorLoading, setMapVendorLoading] = useState(false);

  const [subcategoryVendors, setSubcategoryVendors] = useState<
    TaxonomyVendor[]
  >([]);
  const [subcategoryVendorsLoading, setSubcategoryVendorsLoading] =
    useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [companyPocsOpen, setCompanyPocsOpen] = useState(false);
  const [assignForm, setAssignForm] = useState<CategoryAssignForm>(
    emptyCategoryAssignForm()
  );
  const [assignSaving, setAssignSaving] = useState(false);
  const [assignCustomSubcategory, setAssignCustomSubcategory] = useState("");
  const [assignCustomKeywords, setAssignCustomKeywords] = useState("");
  const [assignAddingSubcategory, setAssignAddingSubcategory] = useState(false);
  const [assignRemovingSubcategory, setAssignRemovingSubcategory] = useState<
    string | null
  >(null);
  const [availablePocs, setAvailablePocs] = useState<
    VendorListItem["contacts"]
  >([]);
  const [availablePocsLoading, setAvailablePocsLoading] = useState(false);

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
      const vendorEntry: TaxonomyVendor = {
        vendorId: mapping.vendorId,
        vendorName: mapping.vendorName,
        vendorCategoryId: mapping.vendorCategoryId,
        active: mapping.active,
        phone: mapping.phone,
        email: mapping.email,
        contacts: mapping.contacts,
      };
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
        const isNewSub = !subRow;
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
        const existingIndex = subRow.vendors.findIndex(
          (row) => row.vendorId === mapping.vendorId
        );
        const isNewVendor = existingIndex < 0;
        if (existingIndex >= 0) subRow.vendors[existingIndex] = vendorEntry;
        else subRow.vendors.push(vendorEntry);
        if (isNewVendor) subRow.vendorCount += 1;
        subRow.vendorCount = Math.max(subRow.vendorCount, subRow.vendors.length);
        categoryRow.subcategoryCount = categoryRow.subcategories.length;
        if (isNewSub || isNewVendor) {
          categoryRow.vendorCount += isNewVendor ? 1 : 0;
        }
        return [...next];
      });
      setSubcategoryVendors((current) => {
        if (
          selectedCategory !== category ||
          selectedSubcategory !== subcategory
        ) {
          return current;
        }
        const existingIndex = current.findIndex(
          (row) => row.vendorId === mapping.vendorId
        );
        if (existingIndex >= 0) {
          const next = [...current];
          next[existingIndex] = vendorEntry;
          return next;
        }
        return [...current, vendorEntry];
      });
    },
    [selectedCategory, selectedSubcategory, upsertVendorLocal]
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
        setLoading(false);
      }
    },
    [toast]
  );

  useEffect(() => {
    // Skip blocking spinner on By vendor; taxonomy still prefetches in background.
    void loadTaxonomy(initialTab !== "category");
  }, [loadTaxonomy]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setTab(initialTab);
    if (initialVendorId) {
      setSelectedVendorId(initialVendorId);
    }
  }, [initialTab, initialVendorId]);

  useEffect(() => {
    if (!selectedVendorId) {
      setSelectedVendor(null);
      return;
    }
    const cached = vendors.find((vendor) => vendor.id === selectedVendorId);
    if (cached && cached.categories?.length) {
      setSelectedVendor(cached);
    }
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(
          `/api/vendors/${selectedVendorId}?light=1`
        );
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

  const loadSubcategoryVendors = useCallback(
    async (category: string, subcategory: string) => {
      setSubcategoryVendorsLoading(true);
      try {
        const params = new URLSearchParams({
          category,
          subcategory,
        });
        const response = await fetch(
          `/api/admin/taxonomy/vendors?${params.toString()}`
        );
        const data = await response.json().catch(() => null);
        if (!response.ok) {
          setSubcategoryVendors([]);
          return;
        }
        setSubcategoryVendors(
          Array.isArray(data?.vendors) ? (data.vendors as TaxonomyVendor[]) : []
        );
      } catch {
        setSubcategoryVendors([]);
      } finally {
        setSubcategoryVendorsLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (tab !== "category" || selectedSubcategory == null) {
      setSubcategoryVendors([]);
      setSubcategoryVendorsLoading(false);
      return;
    }
    void loadSubcategoryVendors(selectedCategory, selectedSubcategory);
  }, [
    tab,
    selectedCategory,
    selectedSubcategory,
    loadSubcategoryVendors,
  ]);

  useEffect(() => {
    if (tab !== "vendor") return;
    const q = vendorQuery.trim();
    const handle = window.setTimeout(() => {
      void (async () => {
        setVendorSearching(true);
        try {
          const params = new URLSearchParams({
            active: "true",
            light: "1",
            // Default list shows a top slice; search expands the pool.
            limit: q ? "40" : "10",
          });
          if (q) params.set("q", q);
          const response = await fetch(`/api/vendors?${params}`);
          const data = await response.json();
          setVendors(Array.isArray(data) ? data : []);
        } catch {
          toast("Vendor search failed", "error");
        } finally {
          setVendorSearching(false);
        }
      })();
    }, q ? 250 : 0);
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

  const taxonomyStats = useMemo(() => {
    const subcategories = taxonomy.reduce(
      (sum, row) => sum + row.subcategoryCount,
      0
    );
    const vendorsMapped = taxonomy.reduce(
      (sum, row) => sum + row.vendorCount,
      0
    );
    return {
      categories: taxonomy.length,
      subcategories,
      vendorsMapped,
    };
  }, [taxonomy]);

  const filteredVendors = vendors;

  const subcategoryOptionsForAssign = useMemo(() => {
    const category = assignForm.category;
    const row = taxonomy.find((item) => item.category === category);
    const fromApi = (row?.subcategories || []).map((sub) => sub.subcategory);
    const selectedExtra = assignForm.subcategories.filter(
      (sub) => sub && !fromApi.includes(sub)
    );
    return [...new Set([...fromApi.filter(Boolean), ...selectedExtra])].sort(
      (a, b) => a.localeCompare(b)
    );
  }, [taxonomy, assignForm.category, assignForm.subcategories]);

  useEffect(() => {
    if (!assignOpen || !selectedVendorId || assignForm.subcategories.length === 0) {
      setAvailablePocs([]);
      setAvailablePocsLoading(false);
      return;
    }
    let cancelled = false;
    setAvailablePocsLoading(true);
    void (async () => {
      try {
        const response = await fetch(
          `/api/vendors/${selectedVendorId}?light=1`
        );
        const data = await response.json().catch(() => null);
        if (cancelled) return;
        if (!response.ok || !data) {
          setAvailablePocs([]);
          setAvailablePocsLoading(false);
          return;
        }
        const vendor = data as VendorListItem;
        const selected = new Set(
          assignForm.subcategories.map((sub) => sub.trim().toLowerCase())
        );
        const contacts = (vendor.contacts || []).filter((contact) => {
          if (!contact.vendorCategoryId) return false;
          if (
            (contact.category || "").trim().toLowerCase() !==
            assignForm.category.trim().toLowerCase()
          ) {
            return false;
          }
          return selected.has((contact.subcategory || "").trim().toLowerCase());
        });
        setAvailablePocs(contacts);
      } catch {
        if (!cancelled) setAvailablePocs([]);
      } finally {
        if (!cancelled) setAvailablePocsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    assignOpen,
    selectedVendorId,
    assignForm.category,
    assignForm.subcategories,
  ]);

  const mapVendorMatches = mapSearchResults;

  function openMapModal(subcategory: string) {
    setSelectedSubcategory(subcategory);
    setMapForm(emptyMapForm());
    setMapVendorSearch("");
    setMapSearchOpen(true);
    setMapSelectedVendors([]);
    setMapOpen(true);
  }

  function removeMapSelectedVendor(vendorId: string) {
    setMapSelectedVendors((current) =>
      current.filter((vendor) => vendor.id !== vendorId)
    );
    setMapForm((current) => {
      const nextContacts = { ...current.vendorContacts };
      delete nextContacts[vendorId];
      return {
        ...current,
        vendorIds: current.vendorIds.filter((id) => id !== vendorId),
        vendorContacts: nextContacts,
      };
    });
  }

  async function selectExistingVendor(vendorId: string) {
    if (mapForm.vendorIds.includes(vendorId)) {
      removeMapSelectedVendor(vendorId);
      return;
    }
    const alreadyMapped = subcategoryVendors.some(
      (vendor) => vendor.vendorId === vendorId
    );
    if (alreadyMapped) {
      toast("Vendor is already mapped to this subcategory", "error");
      return;
    }
    setMapVendorLoading(true);
    try {
      const response = await fetch(`/api/vendors/${vendorId}?light=1`);
      const data = await response.json();
      if (!response.ok) {
        toast(apiError(data.error) || "Could not load vendor details", "error");
        setMapVendorLoading(false);
        return;
      }
      const vendor = data as VendorListItem;
      const seeded = seedVendorMapContacts(vendor);
      setMapSelectedVendors((current) => {
        if (current.some((row) => row.id === vendor.id)) return current;
        return [...current, vendor];
      });
      setMapForm((current) => ({
        ...current,
        mode: "existing",
        vendorIds: current.vendorIds.includes(vendor.id)
          ? current.vendorIds
          : [...current.vendorIds, vendor.id],
        vendorContacts: {
          ...current.vendorContacts,
          [vendor.id]: current.vendorContacts[vendor.id] || seeded,
        },
      }));
      setMapVendorSearch("");
      setMapSearchOpen(true);
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

  function updateMapVendorPoc(
    vendorId: string,
    index: number,
    patch: Partial<MapPoc>
  ) {
    setMapForm((current) => {
      const rows = current.vendorContacts[vendorId] || [emptyPoc()];
      return {
        ...current,
        vendorContacts: {
          ...current.vendorContacts,
          [vendorId]: rows.map((contact, contactIndex) =>
            contactIndex === index ? { ...contact, ...patch } : contact
          ),
        },
      };
    });
  }

  function addMapVendorPoc(vendorId: string) {
    setMapForm((current) => {
      const rows = current.vendorContacts[vendorId] || [emptyPoc()];
      return {
        ...current,
        vendorContacts: {
          ...current.vendorContacts,
          [vendorId]: [...rows, emptyPoc()],
        },
      };
    });
  }

  function removeMapVendorPoc(vendorId: string, index: number) {
    setMapForm((current) => {
      const rows = current.vendorContacts[vendorId] || [emptyPoc()];
      const next =
        rows.length > 1
          ? rows.filter((_, contactIndex) => contactIndex !== index)
          : [emptyPoc()];
      return {
        ...current,
        vendorContacts: {
          ...current.vendorContacts,
          [vendorId]: next,
        },
      };
    });
  }

  function updateAssignPoc(index: number, patch: Partial<MapPoc>) {
    setAssignForm((current) => ({
      ...current,
      contacts: current.contacts.map((contact, contactIndex) =>
        contactIndex === index ? { ...contact, ...patch } : contact
      ),
    }));
  }

  function upsertTaxonomySubcategoryLocal(
    category: string,
    subcategory: string
  ) {
    setTaxonomy((current) => {
      const next = current.map((row) => ({
        ...row,
        subcategories: [...row.subcategories],
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
      if (
        !categoryRow.subcategories.some((sub) => sub.subcategory === subcategory)
      ) {
        categoryRow.subcategories.push({
          subcategory,
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
  }

  function removeTaxonomySubcategoryLocal(
    category: string,
    subcategory: string
  ) {
    setTaxonomy((current) =>
      current.map((row) => {
        if (row.category !== category) return row;
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
  }

  function toggleAssignSubcategory(subcategory: string) {
    setAssignForm((current) => {
      const exists = current.subcategories.includes(subcategory);
      if (exists) {
        const nextKeywords = { ...current.subcategoryKeywords };
        delete nextKeywords[subcategory];
        return {
          ...current,
          subcategories: current.subcategories.filter(
            (value) => value !== subcategory
          ),
          subcategoryKeywords: nextKeywords,
        };
      }
      return {
        ...current,
        subcategories: [...current.subcategories, subcategory],
        subcategoryKeywords: {
          ...current.subcategoryKeywords,
          [subcategory]: current.subcategoryKeywords[subcategory] || "",
        },
      };
    });
  }

  function updateAssignSubcategoryKeywords(
    subcategory: string,
    keywords: string
  ) {
    setAssignForm((current) => ({
      ...current,
      subcategoryKeywords: {
        ...current.subcategoryKeywords,
        [subcategory]: keywords,
      },
    }));
  }

  function assignContactsPayload() {
    return assignForm.contacts
      .map((contact) => ({
        name: contact.name.trim(),
        email: contact.email.trim(),
        phone: contact.phone.trim(),
        role: contact.role.trim() || "Category POC",
      }))
      .filter((contact) => contact.name || contact.email || contact.phone);
  }

  async function persistVendorSubcategoryMapping(input: {
    category: string;
    subcategory: string;
    keywords: string[];
    contacts?: ReturnType<typeof assignContactsPayload>;
  }) {
    if (!selectedVendorId) {
      throw new Error("Select a vendor first");
    }
    const response = await fetch("/api/admin/vendor-maps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vendorId: selectedVendorId,
        category: input.category,
        subcategory: input.subcategory,
        keywords: input.keywords,
        contacts: input.contacts ?? [],
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(apiError(data.error) || "Could not save mapping");
    }
    if (data.vendor && data.mapping) {
      applyVendorMappingLocal({
        category: data.category || input.category,
        subcategory: data.subcategory ?? input.subcategory,
        vendor: data.vendor as VendorListItem,
        mapping: data.mapping,
      });
    }
    return data;
  }

  async function addCustomAssignSubcategory() {
    const value = assignCustomSubcategory.trim();
    if (!value || assignAddingSubcategory) return;
    if (!selectedVendorId) {
      toast("Select a vendor first", "error");
      return;
    }
    const category = assignForm.category;
    const keywordsText = assignCustomKeywords.trim();
    const keywords = parseKeywordInput(keywordsText);
    setAssignAddingSubcategory(true);
    try {
      const taxonomyResponse = await fetch("/api/admin/taxonomy/subcategory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, subcategory: value }),
      });
      const taxonomyData = await taxonomyResponse.json().catch(() => ({}));
      if (!taxonomyResponse.ok) {
        toast(
          apiError(taxonomyData.error) || "Could not save subcategory",
          "error"
        );
        return;
      }

      await persistVendorSubcategoryMapping({
        category,
        subcategory: value,
        keywords,
        contacts: assignContactsPayload(),
      });

      upsertTaxonomySubcategoryLocal(category, value);
      setAssignForm((current) => ({
        ...current,
        subcategories: current.subcategories.includes(value)
          ? current.subcategories
          : [...current.subcategories, value],
        subcategoryKeywords: {
          ...current.subcategoryKeywords,
          [value]:
            keywordsText || current.subcategoryKeywords[value] || "",
        },
      }));
      setAssignCustomSubcategory("");
      setAssignCustomKeywords("");
      await loadTaxonomy(true);
      toast(`Saved ${category} / ${value} for this vendor`);
    } catch (err) {
      toast(
        err instanceof Error ? err.message : "Could not save subcategory",
        "error"
      );
    } finally {
      setAssignAddingSubcategory(false);
    }
  }

  async function removeAssignSubcategory(subcategory: string) {
    const category = assignForm.category;
    const label = subcategory || "(category-level)";
    if (!selectedVendorId) {
      toast("Select a vendor first", "error");
      return;
    }
    if (
      !confirm(
        `Unlink this vendor from "${label}" under ${category}? Other vendors stay mapped.`
      )
    ) {
      return;
    }
    setAssignRemovingSubcategory(subcategory);
    try {
      const response = await fetch("/api/admin/vendor-maps", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendorId: selectedVendorId,
          category,
          subcategory,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast(apiError(data.error) || "Could not unlink subcategory", "error");
        return;
      }
      setAssignForm((current) => {
        const nextKeywords = { ...current.subcategoryKeywords };
        delete nextKeywords[subcategory];
        return {
          ...current,
          subcategories: current.subcategories.filter(
            (value) => value !== subcategory
          ),
          subcategoryKeywords: nextKeywords,
        };
      });
      setTaxonomy((current) =>
        current.map((row) => {
          if (row.category !== category) return row;
          const subcategories = row.subcategories.map((sub) => {
            if (sub.subcategory !== subcategory) return sub;
            const vendorsForSub = sub.vendors.filter(
              (vendor) => vendor.vendorId !== selectedVendorId
            );
            return {
              ...sub,
              vendors: vendorsForSub,
              vendorCount: Math.max(0, sub.vendorCount - 1),
            };
          });
          return {
            ...row,
            subcategories,
            vendorCount: Math.max(0, row.vendorCount - 1),
          };
        })
      );
      const vendorResponse = await fetch(
        `/api/vendors/${selectedVendorId}?light=1`
      );
      const vendor = await vendorResponse.json().catch(() => null);
      if (vendor?.id) {
        setSelectedVendor(vendor);
        upsertVendorLocal(vendor);
      }
      toast(
        data.deleted
          ? `Unlinked vendor from ${label}`
          : `No mapping for ${label}`
      );
    } finally {
      setAssignRemovingSubcategory(null);
    }
  }

  function useAvailablePoc(contact: VendorListItem["contacts"][number]) {
    const next: MapPoc = {
      name: contact.name || "",
      email: contact.email || "",
      phone: contact.phone || "",
      role: contact.role || "Category POC",
    };
    setAssignForm((current) => {
      const already = current.contacts.some(
        (row) => pocKey(row) === pocKey(next)
      );
      if (already) return current;
      const blankOnly =
        current.contacts.length === 1 &&
        !current.contacts[0].name &&
        !current.contacts[0].email &&
        !current.contacts[0].phone;
      return {
        ...current,
        contacts: blankOnly ? [next] : [...current.contacts, next],
      };
    });
  }

  async function submitMap(event: FormEvent) {
    event.preventDefault();
    if (!selectedCategory || selectedSubcategory == null) return;
    if (mapForm.mode === "existing" && mapForm.vendorIds.length === 0) {
      toast("Search and select at least one vendor", "error");
      return;
    }

    setMapSaving(true);
    const keywords = parseKeywordInput(mapForm.keywords);

    if (mapForm.mode === "new") {
      const contacts = normalizeMapContacts(mapForm.contacts);
      const response = await fetch("/api/admin/vendor-maps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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
                ].filter(
                  (contact) => contact.name || contact.email || contact.phone
                ),
        }),
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
      await loadSubcategoryVendors(selectedCategory, selectedSubcategory);
      toast(
        `Mapped ${data.vendor?.name || "vendor"} to ${selectedCategory}` +
          (selectedSubcategory ? ` / ${selectedSubcategory}` : "")
      );
      return;
    }

    let saved = 0;
    let lastError = "";
    let lastName = "";
    for (const vendorId of mapForm.vendorIds) {
      const contacts = normalizeMapContacts(
        mapForm.vendorContacts[vendorId] || []
      );
      const response = await fetch("/api/admin/vendor-maps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendorId,
          category: selectedCategory,
          subcategory: selectedSubcategory,
          keywords,
          contacts,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        lastError = apiError(data.error) || "Could not save mapping";
        continue;
      }
      saved += 1;
      lastName = data.vendor?.name || lastName;
      if (data.vendor && data.mapping) {
        applyVendorMappingLocal({
          category: data.category || selectedCategory,
          subcategory: data.subcategory ?? selectedSubcategory,
          vendor: data.vendor as VendorListItem,
          mapping: data.mapping,
        });
      }
    }

    setMapSaving(false);
    if (saved === 0) {
      toast(lastError || "Could not save mapping", "error");
      return;
    }
    setMapOpen(false);
    await loadSubcategoryVendors(selectedCategory, selectedSubcategory);
    toast(
      saved === 1
        ? `Mapped ${lastName || "vendor"} to ${selectedCategory}${
            selectedSubcategory ? ` / ${selectedSubcategory}` : ""
          }`
        : `Mapped ${saved} vendors to ${selectedCategory}${
            selectedSubcategory ? ` / ${selectedSubcategory}` : ""
          }`
    );
    if (lastError && saved > 0) {
      toast(`Some mappings failed: ${lastError}`, "error");
    }
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
            vendorCount: Math.max(0, sub.vendorCount - 1),
          };
        });
        return {
          ...row,
          subcategories,
          vendorCount: Math.max(0, row.vendorCount - 1),
        };
      })
    );
    setSubcategoryVendors((current) =>
      current.filter((vendor) => vendor.vendorId !== vendorId)
    );
    if (selectedVendorId === vendorId) {
      setSelectedVendorId(vendorId);
      void fetch(`/api/vendors/${vendorId}?light=1`)
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

  async function submitCategoryAssign(event: FormEvent) {
    event.preventDefault();
    if (!selectedVendorId) return;
    const subcategories = [
      ...new Set(assignForm.subcategories.map((s) => s.trim()).filter(Boolean)),
    ];
    const existingSubs = [
      ...new Set(
        (selectedVendor?.categories || [])
          .filter((row) => row.category === assignForm.category)
          .map((row) => row.subcategory || "")
      ),
    ];
    const toUnlink = existingSubs.filter(
      (subcategory) => !subcategories.includes(subcategory)
    );
    if (subcategories.length === 0 && toUnlink.length === 0) {
      toast("Select at least one subcategory", "error");
      return;
    }
    setAssignSaving(true);
    const contacts = assignContactsPayload();

    let lastError = "";
    let saved = 0;
    let unlinked = 0;

    for (const subcategory of toUnlink) {
      try {
        const response = await fetch("/api/admin/vendor-maps", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            vendorId: selectedVendorId,
            category: assignForm.category,
            subcategory,
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          lastError = apiError(data.error) || "Could not unlink subcategory";
          continue;
        }
        if (data.deleted) unlinked += 1;
      } catch (err) {
        lastError =
          err instanceof Error ? err.message : "Could not unlink subcategory";
      }
    }

    for (const subcategory of subcategories) {
      try {
        // Ensure taxonomy label exists before mapping.
        const taxonomyResponse = await fetch(
          "/api/admin/taxonomy/subcategory",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              category: assignForm.category,
              subcategory,
            }),
          }
        );
        if (!taxonomyResponse.ok) {
          const taxonomyData = await taxonomyResponse.json().catch(() => ({}));
          lastError =
            apiError(taxonomyData.error) || "Could not save subcategory";
          continue;
        }

        await persistVendorSubcategoryMapping({
          category: assignForm.category,
          subcategory,
          keywords: parseKeywordInput(
            assignForm.subcategoryKeywords[subcategory] || ""
          ),
          contacts,
        });
        saved += 1;
      } catch (err) {
        lastError =
          err instanceof Error ? err.message : "Could not save mapping";
      }
    }

    setAssignSaving(false);
    if (saved === 0 && unlinked === 0) {
      toast(lastError || "Could not save mapping", "error");
      return;
    }
    await loadTaxonomy(true);
    if (selectedVendorId) {
      const vendorResponse = await fetch(
        `/api/vendors/${selectedVendorId}?light=1`
      );
      const vendor = await vendorResponse.json().catch(() => null);
      if (vendor?.id) {
        setSelectedVendor(vendor);
        upsertVendorLocal(vendor);
      }
    }
    setAssignOpen(false);
    const parts: string[] = [];
    if (saved === 1) {
      parts.push(`Mapped ${assignForm.category} / ${subcategories[0]}`);
    } else if (saved > 1) {
      parts.push(`Mapped ${assignForm.category} to ${saved} subcategories`);
    }
    if (unlinked > 0) {
      parts.push(`unlinked ${unlinked}`);
    }
    toast(parts.join(" · ") || "Mapping updated");
    if (lastError && (saved > 0 || unlinked > 0)) {
      toast(`Some changes failed: ${lastError}`, "error");
    }
  }

  return (
    <div className="relative isolate space-y-3">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-2 -z-10 h-28 bg-[radial-gradient(ellipse_at_top,_rgba(142,182,155,0.22),_transparent_70%)]"
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="text-xl font-semibold tracking-tight text-dark-primary">
              Vendor mapping
            </h1>
            {!loading || taxonomy.length > 0 ? (
              <p className="text-xs text-mid-green">
                {taxonomyStats.categories} categories ·{" "}
                {taxonomyStats.subcategories} subcategories ·{" "}
                {taxonomyStats.vendorsMapped} mapped
              </p>
            ) : null}
          </div>
          <p className="mt-0.5 text-xs text-mid-green">
            Category / subcategory POCs ·{" "}
            <Link
              href="/vendors"
              className="font-medium text-dark-secondary underline decoration-light-green/60 underline-offset-2 hover:text-dark-primary"
            >
              Vendors
            </Link>
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-light-green/30 bg-white/80 p-0.5 text-sm">
          <button
            type="button"
            onClick={() => {
              setTab("category");
              syncVendorMappingUrl({ tab: "category" });
            }}
            className={`rounded-md px-3 py-1.5 font-medium transition ${
              tab === "category"
                ? "bg-mid-green text-background shadow-sm"
                : "text-dark-primary/80 hover:bg-light-green/15 hover:text-dark-primary"
            }`}
          >
            By category
          </button>
          <button
            type="button"
            onClick={() => {
              setTab("vendor");
              syncVendorMappingUrl({
                tab: "vendor",
                vendorId: selectedVendorId,
              });
            }}
            className={`rounded-md px-3 py-1.5 font-medium transition ${
              tab === "vendor"
                ? "bg-mid-green text-background shadow-sm"
                : "text-dark-primary/80 hover:bg-light-green/15 hover:text-dark-primary"
            }`}
          >
            By vendor
          </button>
        </div>
      </div>

      {loading && tab === "category" ? (
        <MappingEmptyState>Loading taxonomy…</MappingEmptyState>
      ) : tab === "category" ? (
        <div className="grid animate-[login-fade-up_0.35s_ease-out] gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
          <MappingPanel className="sticky top-4 self-start p-3">
            <div className="relative mb-3">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-mid-green" />
              <input
                value={categoryQuery}
                onChange={(event) => setCategoryQuery(event.target.value)}
                placeholder="Filter categories"
                className="w-full rounded-xl border border-light-green/35 bg-background/60 py-2 pl-8 pr-2 text-sm outline-none transition focus:border-mid-green focus:ring-2 focus:ring-mid-green/15"
              />
            </div>
            <div className="max-h-[70vh] space-y-0.5 overflow-y-auto pr-0.5">
              {filteredCategories.length === 0 ? (
                <p className="px-2 py-6 text-center text-xs text-mid-green">
                  No categories match
                </p>
              ) : (
                filteredCategories.map((row) => {
                  const active = selectedCategory === row.category;
                  return (
                    <button
                      key={row.category}
                      type="button"
                      onClick={() => {
                        setSelectedCategory(row.category);
                        setSelectedSubcategory(null);
                      }}
                      className={`flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-sm transition ${
                        active
                          ? "bg-mid-green text-background shadow-sm"
                          : "text-dark-primary/90 hover:bg-light-green/20"
                      }`}
                    >
                      <span className="truncate pr-2 font-medium">
                        {row.category}
                      </span>
                      <span
                        className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] tabular-nums ${
                          active
                            ? "bg-background/20 text-background"
                            : "bg-light-green/25 text-mid-green"
                        }`}
                      >
                        {row.vendorCount}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </MappingPanel>

          <MappingPanel className="space-y-5 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-light-green/20 pb-4">
              <div>
                <h2 className="text-xl font-semibold tracking-tight text-dark-primary">
                  {selectedCategory}
                </h2>
                <p className="mt-0.5 text-xs text-mid-green">
                  {subcategoryRows.length} subcategories ·{" "}
                  {categoryRow?.vendorCount || 0} mapped vendors
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={newSubcategory}
                  onChange={(event) => setNewSubcategory(event.target.value)}
                  placeholder="New subcategory"
                  className="rounded-xl border border-light-green/35 bg-background/60 px-3 py-2 text-sm outline-none transition focus:border-mid-green focus:ring-2 focus:ring-mid-green/15"
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
                  className="inline-flex items-center gap-1.5 rounded-xl bg-mid-green px-3.5 py-2 text-sm font-medium text-background transition hover:bg-dark-secondary disabled:opacity-60"
                >
                  <Plus className="h-3.5 w-3.5" strokeWidth={1.6} />
                  {addingSubcategory ? "Saving…" : "Add subcategory"}
                </button>
              </div>
            </div>

            <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
              {subcategoryRows.length === 0 ? (
                <div className="md:col-span-2 xl:col-span-3">
                  <MappingEmptyState>
                    No subcategories yet. Add one above, or map vendors after
                    products create catalog subcategories.
                  </MappingEmptyState>
                </div>
              ) : (
                subcategoryRows.map((row) => {
                  const active = selectedSubcategory === row.subcategory;
                  return (
                    <button
                      key={row.subcategory || "__empty__"}
                      type="button"
                      onClick={() => setSelectedSubcategory(row.subcategory)}
                      className={`rounded-xl border px-3.5 py-3.5 text-left transition ${
                        active
                          ? "border-mid-green bg-mid-green text-background shadow-sm"
                          : "border-light-green/30 bg-background/40 hover:border-mid-green/45 hover:bg-white"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium">
                          {row.subcategory || "(category-level)"}
                        </p>
                        <span
                          className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${
                            active
                              ? "bg-background/20 text-background"
                              : "bg-light-green/30 text-mid-green"
                          }`}
                        >
                          {row.fromCatalog
                            ? "Catalog"
                            : row.fromAdmin
                              ? "Admin"
                              : "Mapped"}
                        </span>
                      </div>
                      <p
                        className={`mt-1.5 text-xs ${
                          active ? "text-background/80" : "text-mid-green"
                        }`}
                      >
                        {row.vendorCount} vendor
                        {row.vendorCount === 1 ? "" : "s"}
                      </p>
                    </button>
                  );
                })
              )}
            </div>

            {selectedSubRow ? (
              <div className="rounded-2xl border border-light-green/25 bg-background/40 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-dark-primary">
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
                      className="inline-flex items-center gap-1.5 rounded-xl bg-mid-green px-3.5 py-2 text-sm font-medium text-background transition hover:bg-dark-secondary"
                    >
                      <UserPlus className="h-3.5 w-3.5" strokeWidth={1.6} />
                      Add vendors
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void removeSubcategory(selectedSubRow.subcategory)
                      }
                      className="inline-flex items-center gap-1.5 rounded-xl border border-red-200/80 bg-white px-3.5 py-2 text-sm font-medium text-red-800 transition hover:bg-red-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={1.6} />
                      Remove subcategory
                    </button>
                  </div>
                </div>

                <div className="mt-4 overflow-hidden rounded-xl border border-light-green/25 bg-white">
                  <table className="w-full text-left text-sm">
                    <thead className="sticky top-0 bg-dark-secondary/[0.04] text-xs text-mid-green">
                      <tr>
                        <th className="px-3.5 py-2.5 font-medium">Vendor</th>
                        <th className="px-3.5 py-2.5 font-medium">
                          Department POCs
                        </th>
                        <th className="px-3.5 py-2.5" />
                      </tr>
                    </thead>
                    <tbody>
                      {subcategoryVendorsLoading ? (
                        <tr>
                          <td
                            colSpan={3}
                            className="px-3.5 py-8 text-center text-mid-green"
                          >
                            Loading vendors…
                          </td>
                        </tr>
                      ) : subcategoryVendors.length === 0 ? (
                        <tr>
                          <td
                            colSpan={3}
                            className="px-3.5 py-8 text-center text-mid-green"
                          >
                            No vendors mapped yet
                          </td>
                        </tr>
                      ) : (
                        subcategoryVendors.map((vendor, index) => {
                          return (
                            <tr
                              key={vendor.vendorCategoryId}
                              className={`border-t border-light-green/15 transition hover:bg-light-green/10 ${
                                index % 2 === 1 ? "bg-background/35" : ""
                              }`}
                            >
                              <td className="px-3.5 py-3">
                                <div className="font-medium text-dark-primary">
                                  {vendor.vendorName}
                                </div>
                                <div className="text-xs text-mid-green">
                                  {vendor.phone || vendor.email || "—"}
                                </div>
                              </td>
                              <td className="px-3.5 py-3">
                                {vendor.contacts.length > 0 ? (
                                  <ul className="space-y-1.5">
                                    {vendor.contacts.map((poc) => (
                                      <li key={poc.id}>
                                        <div className="text-dark-primary">
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
                              <td className="px-3.5 py-3 text-right">
                                <button
                                  type="button"
                                  onClick={() =>
                                    void unlinkVendor(
                                      vendor.vendorId,
                                      selectedCategory,
                                      selectedSubRow.subcategory
                                    )
                                  }
                                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-mid-green transition hover:bg-light-green/25"
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
            ) : (
              <MappingEmptyState>
                Select a subcategory to view mapped vendors and POCs.
              </MappingEmptyState>
            )}
          </MappingPanel>
        </div>
      ) : (
        <div className="grid animate-[login-fade-up_0.35s_ease-out] gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          <MappingPanel className="sticky top-4 self-start p-3">
            <div className="relative mb-3">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-mid-green" />
              <input
                value={vendorQuery}
                onChange={(event) => setVendorQuery(event.target.value)}
                placeholder="Search vendors"
                className="w-full rounded-xl border border-light-green/35 bg-background/60 py-2 pl-8 pr-2 text-sm outline-none transition focus:border-mid-green focus:ring-2 focus:ring-mid-green/15"
              />
            </div>
            <div className="max-h-[70vh] space-y-0.5 overflow-y-auto pr-0.5">
              {vendorSearching && filteredVendors.length === 0 ? (
                <MappingEmptyState>Loading vendors…</MappingEmptyState>
              ) : filteredVendors.length === 0 ? (
                <MappingEmptyState>
                  {vendorQuery.trim()
                    ? "No vendors match"
                    : "No vendors found"}
                </MappingEmptyState>
              ) : (
                <>
                  {!vendorQuery.trim() ? (
                    <p className="px-2 pb-1 text-[11px] text-mid-green">
                      Top {filteredVendors.length} vendors · search for more
                    </p>
                  ) : null}
                  {filteredVendors.map((vendor) => {
                    const active = selectedVendorId === vendor.id;
                    return (
                      <button
                        key={vendor.id}
                        type="button"
                        onClick={() => {
                          setSelectedVendorId(vendor.id);
                          syncVendorMappingUrl({
                            tab: "vendor",
                            vendorId: vendor.id,
                          });
                        }}
                        className={`flex w-full flex-col rounded-xl px-2.5 py-2 text-left text-sm transition ${
                          active
                            ? "bg-mid-green text-background shadow-sm"
                            : "text-dark-primary/90 hover:bg-light-green/20"
                        }`}
                      >
                        <span className="truncate font-medium">
                          {vendor.name}
                        </span>
                        <span
                          className={`text-[11px] font-normal ${
                            active ? "text-background/80" : "text-mid-green"
                          }`}
                        >
                          {vendor.categories?.length || 0} categor
                          {(vendor.categories?.length || 0) === 1
                            ? "y"
                            : "ies"}
                        </span>
                      </button>
                    );
                  })}
                </>
              )}
            </div>
          </MappingPanel>

          <MappingPanel className="p-5">
            {!selectedVendor ? (
              <MappingEmptyState>
                Select a vendor to assign categories, subcategories, and POCs.
              </MappingEmptyState>
            ) : (
              <div className="space-y-4">
                {(() => {
                  const companyPocs = selectedVendor.contacts.filter(
                    (contact) => !contact.vendorCategoryId
                  );
                  const mappedPocCount = selectedVendor.contacts.filter(
                    (contact) => contact.vendorCategoryId
                  ).length;
                  const categoryGroups = Object.entries(
                    selectedVendor.categories.reduce<
                      Record<
                        string,
                        Array<(typeof selectedVendor.categories)[number]>
                      >
                    >((acc, mapping) => {
                      const key = mapping.category || "Uncategorized";
                      if (!acc[key]) acc[key] = [];
                      acc[key].push(mapping);
                      return acc;
                    }, {})
                  )
                    .map(([category, mappings]) => [
                      category,
                      mappings
                        .slice()
                        .sort((a, b) =>
                          (a.subcategory || "").localeCompare(
                            b.subcategory || ""
                          )
                        ),
                    ] as const)
                    .sort(([a], [b]) => a.localeCompare(b));

                  return (
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-light-green/20 pb-4">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="text-xl font-semibold tracking-tight text-dark-primary">
                              {selectedVendor.name}
                            </h2>
                            <span
                              className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${
                                selectedVendor.active
                                  ? "bg-mid-green/15 text-mid-green"
                                  : "bg-dark-primary/10 text-mid-green"
                              }`}
                            >
                              {selectedVendor.active ? "Active" : "Inactive"}
                            </span>
                          </div>
                          <p className="mt-1.5 text-xs text-mid-green">
                            {[selectedVendor.phone, selectedVendor.email]
                              .filter(Boolean)
                              .join(" · ") || "No company contact"}
                            {" · "}
                            {categoryGroups.length} categor
                            {categoryGroups.length === 1 ? "y" : "ies"}
                            {" · "}
                            {selectedVendor.categories.length} subcategor
                            {selectedVendor.categories.length === 1
                              ? "y"
                              : "ies"}
                            {" · "}
                            {mappedPocCount} mapped POC
                            {mappedPocCount === 1 ? "" : "s"}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setCompanyPocsOpen(true)}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-light-green/35 bg-white px-3.5 py-2 text-sm font-medium text-dark-primary transition hover:bg-light-green/15"
                          >
                            <Users
                              className="h-3.5 w-3.5 text-mid-green"
                              strokeWidth={1.6}
                            />
                            Company POCs
                            <span className="rounded-md bg-mid-green/15 px-1.5 py-0.5 text-[11px] text-mid-green">
                              {companyPocs.length}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setAssignForm(
                                assignFormFromVendor(
                                  selectedVendor,
                                  PRODUCT_CATEGORIES[0]
                                )
                              );
                              setAssignCustomSubcategory("");
                              setAssignCustomKeywords("");
                              setAvailablePocs([]);
                              setAssignOpen(true);
                            }}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-mid-green px-3.5 py-2 text-sm font-medium text-background transition hover:bg-dark-secondary"
                          >
                            <Plus className="h-3.5 w-3.5" strokeWidth={1.6} />
                            Assign category
                          </button>
                        </div>
                      </div>

                      <div className="overflow-x-auto rounded-xl border border-light-green/25 bg-white">
                        <table className="w-full min-w-[760px] text-left text-sm">
                          <thead className="bg-dark-secondary/[0.04] text-xs text-mid-green">
                            <tr>
                              <th className="px-3.5 py-2.5 font-medium">
                                Subcategory
                              </th>
                              <th className="px-3.5 py-2.5 font-medium">
                                Keywords
                              </th>
                              <th className="px-3.5 py-2.5 font-medium">
                                POC name
                              </th>
                              <th className="px-3.5 py-2.5 font-medium">
                                Role
                              </th>
                              <th className="px-3.5 py-2.5 font-medium">
                                Email
                              </th>
                              <th className="px-3.5 py-2.5 font-medium">
                                Phone
                              </th>
                              <th className="px-3.5 py-2.5 font-medium" />
                            </tr>
                          </thead>
                          <tbody>
                            {categoryGroups.length === 0 ? (
                              <tr>
                                <td
                                  colSpan={7}
                                  className="px-3.5 py-10 text-center text-mid-green"
                                >
                                  No category mappings yet
                                </td>
                              </tr>
                            ) : (
                              categoryGroups.flatMap(
                                ([category, mappings]) => {
                                  const headerRow = (
                                    <tr
                                      key={`cat-${category}`}
                                      className="border-t border-light-green/20 bg-mid-green/[0.08]"
                                    >
                                      <td
                                        colSpan={7}
                                        className="px-3.5 py-2.5 font-semibold text-dark-primary"
                                      >
                                        {category}
                                        <span className="ml-2 text-xs font-normal text-mid-green">
                                          {mappings.length} subcategor
                                          {mappings.length === 1 ? "y" : "ies"}
                                        </span>
                                      </td>
                                    </tr>
                                  );

                                  const mappingRows = mappings.flatMap(
                                    (mapping) => {
                                      const pocs =
                                        selectedVendor.contacts.filter(
                                          (contact) =>
                                            contact.vendorCategoryId ===
                                              mapping.id ||
                                            (contact.category ===
                                              mapping.category &&
                                              (contact.subcategory || "") ===
                                                (mapping.subcategory || ""))
                                        );
                                      const rows =
                                        pocs.length > 0
                                          ? pocs
                                          : [
                                              {
                                                id: undefined,
                                                name: "",
                                                email: "",
                                                phone: "",
                                                role: "",
                                                isPrimary: false,
                                              },
                                            ];
                                      return rows.map((poc, pocIndex) => (
                                        <tr
                                          key={`${mapping.id || mapping.category}-${mapping.subcategory}-${poc.id || pocIndex}`}
                                          className="border-t border-light-green/15 align-top transition hover:bg-light-green/10"
                                        >
                                          <td className="px-3.5 py-2.5 font-medium text-dark-primary">
                                            {pocIndex === 0
                                              ? mapping.subcategory || "—"
                                              : ""}
                                          </td>
                                          <td className="px-3.5 py-2.5 text-xs text-mid-green">
                                            {pocIndex === 0
                                              ? mapping.keywords?.length
                                                ? mapping.keywords.join(", ")
                                                : "—"
                                              : ""}
                                          </td>
                                          <td className="px-3.5 py-2.5">
                                            {poc.name ? (
                                              <span className="inline-flex items-center gap-1.5">
                                                {poc.name}
                                                {poc.isPrimary ? (
                                                  <span className="rounded-md bg-mid-green/15 px-1.5 py-0.5 text-[10px] font-medium text-mid-green">
                                                    Primary
                                                  </span>
                                                ) : null}
                                              </span>
                                            ) : (
                                              <span className="text-mid-green">
                                                No subcategory POC
                                              </span>
                                            )}
                                          </td>
                                          <td className="px-3.5 py-2.5 text-mid-green">
                                            {poc.role || "—"}
                                          </td>
                                          <td className="px-3.5 py-2.5 text-mid-green">
                                            {poc.email || "—"}
                                          </td>
                                          <td className="px-3.5 py-2.5 text-mid-green">
                                            {poc.phone || "—"}
                                          </td>
                                          <td className="px-3.5 py-2.5 text-right">
                                            {pocIndex === 0 ? (
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  void unlinkVendor(
                                                    selectedVendor.id,
                                                    mapping.category,
                                                    mapping.subcategory
                                                  )
                                                }
                                                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-mid-green transition hover:bg-light-green/25"
                                              >
                                                <Link2Off
                                                  className="h-3.5 w-3.5"
                                                  strokeWidth={1.6}
                                                />
                                                Remove
                                              </button>
                                            ) : null}
                                          </td>
                                        </tr>
                                      ));
                                    }
                                  );

                                  return [headerRow, ...mappingRows];
                                }
                              )
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </MappingPanel>
        </div>
      )}

      {companyPocsOpen && selectedVendor ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-dark-primary/45 p-4 backdrop-blur-[2px]">
          <div
            className="flex w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-light-green/25 bg-background shadow-[0_24px_64px_rgba(11,43,38,0.22)] animate-[login-fade-up_0.3s_ease-out]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="company-pocs-title"
          >
            <div className="flex items-center justify-between gap-4 border-b border-light-green/20 bg-white/70 px-5 py-3.5">
              <div className="min-w-0">
                <h2
                  id="company-pocs-title"
                  className="truncate text-base font-semibold text-dark-primary"
                >
                  Company-level POCs
                  <span className="ml-2 font-normal text-mid-green">
                    · {selectedVendor.name}
                  </span>
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setCompanyPocsOpen(false)}
                className="rounded-xl p-1.5 text-mid-green transition hover:bg-light-green/20"
                aria-label="Close"
              >
                <X className="h-4 w-4" strokeWidth={1.6} />
              </button>
            </div>
            <div className="p-5">
              <div className="overflow-x-auto rounded-xl border border-light-green/25 bg-white">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="bg-dark-secondary/[0.04] text-xs text-mid-green">
                    <tr>
                      <th className="px-3.5 py-2.5 font-medium">Name</th>
                      <th className="px-3.5 py-2.5 font-medium">Role</th>
                      <th className="px-3.5 py-2.5 font-medium">Email</th>
                      <th className="px-3.5 py-2.5 font-medium">Phone</th>
                      <th className="px-3.5 py-2.5 font-medium">Primary</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedVendor.contacts.filter(
                      (contact) => !contact.vendorCategoryId
                    ).length === 0 ? (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-3 py-6 text-center text-mid-green"
                        >
                          No company-level contacts
                        </td>
                      </tr>
                    ) : (
                      selectedVendor.contacts
                        .filter((contact) => !contact.vendorCategoryId)
                        .map((contact) => (
                          <tr
                            key={
                              contact.id ||
                              `${contact.email}-${contact.phone}`
                            }
                            className="border-t border-light-green/20"
                          >
                            <td className="px-3 py-2.5 font-medium text-dark-primary">
                              {contact.name || "—"}
                            </td>
                            <td className="px-3 py-2.5 text-mid-green">
                              {contact.role || "—"}
                            </td>
                            <td className="px-3 py-2.5 text-mid-green">
                              {contact.email || "—"}
                            </td>
                            <td className="px-3 py-2.5 text-mid-green">
                              {contact.phone || "—"}
                            </td>
                            <td className="px-3 py-2.5 text-mid-green">
                              {contact.isPrimary ? "Yes" : "—"}
                            </td>
                          </tr>
                        ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {mapOpen && selectedSubcategory != null ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-dark-primary/45 p-3 backdrop-blur-[2px]">
          <form
            onSubmit={submitMap}
            className="flex max-h-[88vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-light-green/25 bg-background shadow-[0_24px_64px_rgba(11,43,38,0.22)] animate-[login-fade-up_0.3s_ease-out]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="map-vendor-title"
          >
            <div className="shrink-0 border-b border-light-green/20 bg-white/70 px-5 py-3.5">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2
                    id="map-vendor-title"
                    className="truncate text-base font-semibold text-dark-primary"
                  >
                    Add vendors
                    <span className="ml-2 text-sm font-normal text-mid-green">
                      {selectedCategory}
                      {selectedSubcategory ? ` / ${selectedSubcategory}` : ""}
                    </span>
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setMapOpen(false)}
                  className="rounded-xl p-1.5 text-mid-green transition hover:bg-light-green/20"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" strokeWidth={1.6} />
                </button>
              </div>
              <div className="mt-2.5 grid grid-cols-2 gap-0.5 rounded-xl bg-dark-primary/[0.04] p-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setMapForm((current) => ({
                      ...emptyMapForm(),
                      mode: "existing",
                      keywords: current.keywords,
                    }));
                    setMapSelectedVendors([]);
                    setMapVendorSearch("");
                    setMapSearchOpen(true);
                  }}
                  className={`rounded-lg px-2 py-1.5 text-xs font-medium transition ${
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
                    setMapSelectedVendors([]);
                    setMapVendorSearch("");
                    setMapSearchOpen(false);
                  }}
                  className={`rounded-lg px-2 py-1.5 text-xs font-medium transition ${
                    mapForm.mode === "new"
                      ? "bg-white text-dark-primary shadow-sm"
                      : "text-mid-green"
                  }`}
                >
                  New vendor
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
              {mapForm.mode === "existing" ? (
                <section className="space-y-2">
                  {mapSelectedVendors.length > 0 ? (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-mid-green">
                        Selected · {mapSelectedVendors.length}
                      </p>
                      <div className="space-y-2">
                        {mapSelectedVendors.map((vendor) => {
                          const pocs =
                            mapForm.vendorContacts[vendor.id] || [emptyPoc()];
                          return (
                            <div
                              key={vendor.id}
                              className="rounded-lg border border-mid-green/25 bg-mid-green/5 p-3"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium">
                                    {vendor.name}
                                  </p>
                                  <p className="truncate text-[11px] text-mid-green">
                                    {[vendor.phone, vendor.email]
                                      .filter(Boolean)
                                      .join(" · ") || "No company contact"}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() =>
                                    removeMapSelectedVendor(vendor.id)
                                  }
                                  className="shrink-0 rounded p-1 text-mid-green hover:bg-light-green/30"
                                  aria-label={`Remove ${vendor.name}`}
                                >
                                  <X
                                    className="h-3.5 w-3.5"
                                    strokeWidth={1.6}
                                  />
                                </button>
                              </div>

                              <div className="mt-2 space-y-1.5">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="inline-flex items-center gap-1 text-[11px] font-medium text-dark-primary">
                                    <Users
                                      className="h-3 w-3 text-mid-green"
                                      strokeWidth={1.6}
                                    />
                                    POCs for this vendor
                                  </p>
                                  <button
                                    type="button"
                                    onClick={() => addMapVendorPoc(vendor.id)}
                                    className="inline-flex items-center gap-1 text-[11px] font-medium text-mid-green hover:text-dark-primary"
                                  >
                                    <Plus
                                      className="h-3 w-3"
                                      strokeWidth={1.6}
                                    />
                                    Add POC
                                  </button>
                                </div>
                                {pocs.map((contact, index) => (
                                  <div
                                    key={`${vendor.id}-poc-${index}`}
                                    className="rounded-md border border-dark-primary/8 bg-white p-2"
                                  >
                                    <div className="mb-1 flex items-center justify-between">
                                      <span className="text-[10px] font-medium uppercase tracking-wide text-mid-green">
                                        POC {index + 1}
                                      </span>
                                      {pocs.length > 1 ? (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            removeMapVendorPoc(
                                              vendor.id,
                                              index
                                            )
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
                                          updateMapVendorPoc(
                                            vendor.id,
                                            index,
                                            { name: event.target.value }
                                          )
                                        }
                                        placeholder="Name"
                                        className="rounded-md border border-dark-primary/10 bg-background px-2 py-1.5 text-sm outline-none focus:border-mid-green"
                                      />
                                      <input
                                        value={contact.role}
                                        onChange={(event) =>
                                          updateMapVendorPoc(
                                            vendor.id,
                                            index,
                                            { role: event.target.value }
                                          )
                                        }
                                        placeholder="Role"
                                        className="rounded-md border border-dark-primary/10 bg-background px-2 py-1.5 text-sm outline-none focus:border-mid-green"
                                      />
                                      <input
                                        type="email"
                                        value={contact.email}
                                        onChange={(event) =>
                                          updateMapVendorPoc(
                                            vendor.id,
                                            index,
                                            { email: event.target.value }
                                          )
                                        }
                                        placeholder="Email"
                                        className="rounded-md border border-dark-primary/10 bg-background px-2 py-1.5 text-sm outline-none focus:border-mid-green"
                                      />
                                      <input
                                        value={contact.phone}
                                        onChange={(event) =>
                                          updateMapVendorPoc(
                                            vendor.id,
                                            index,
                                            { phone: event.target.value }
                                          )
                                        }
                                        placeholder="Phone"
                                        className="rounded-md border border-dark-primary/10 bg-background px-2 py-1.5 text-sm outline-none focus:border-mid-green"
                                      />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}

                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-mid-green">
                      Search & add more
                    </p>
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-mid-green" />
                      <input
                        autoFocus
                        value={mapVendorSearch}
                        onChange={(event) => {
                          setMapVendorSearch(event.target.value);
                          setMapSearchOpen(true);
                        }}
                        onFocus={() => setMapSearchOpen(true)}
                        placeholder="Type name, phone, or email…"
                        className="w-full rounded-lg border border-dark-primary/10 bg-white py-2 pl-8 pr-8 text-sm outline-none focus:border-mid-green"
                      />
                      {mapVendorSearch ? (
                        <button
                          type="button"
                          onClick={() => setMapVendorSearch("")}
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-mid-green hover:bg-dark-primary/5"
                          aria-label="Clear search"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </div>
                    {mapSearchOpen ? (
                      <div className="max-h-40 overflow-y-auto rounded-lg border border-dark-primary/8 bg-white">
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
                          mapVendorMatches.map((vendor) => {
                            const selected = mapForm.vendorIds.includes(
                              vendor.id
                            );
                            const alreadyMapped = subcategoryVendors.some(
                              (row) => row.vendorId === vendor.id
                            );
                            return (
                              <button
                                key={vendor.id}
                                type="button"
                                disabled={alreadyMapped}
                                onClick={() =>
                                  void selectExistingVendor(vendor.id)
                                }
                                className={`flex w-full items-start justify-between gap-2 border-b border-dark-primary/5 px-3 py-2 text-left last:border-b-0 disabled:opacity-50 ${
                                  selected
                                    ? "bg-mid-green/10"
                                    : "hover:bg-mid-green/8"
                                }`}
                              >
                                <span className="min-w-0">
                                  <span className="block truncate text-sm font-medium">
                                    {vendor.name}
                                  </span>
                                  <span className="block truncate text-[11px] text-mid-green">
                                    {[vendor.phone, vendor.email]
                                      .filter(Boolean)
                                      .join(" · ") || "No contact"}
                                  </span>
                                </span>
                                <span className="shrink-0 pt-0.5 text-[10px] font-medium text-mid-green">
                                  {alreadyMapped
                                    ? "Mapped"
                                    : selected
                                      ? "Selected"
                                      : "Add"}
                                </span>
                              </button>
                            );
                          })
                        )}
                      </div>
                    ) : null}
                  </div>

                  {mapVendorLoading ? (
                    <p className="py-2 text-center text-xs text-mid-green">
                      Loading…
                    </p>
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

              {mapForm.mode === "new" ? (
                <section className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="inline-flex items-center gap-1 text-xs font-medium text-dark-primary">
                      <Users
                        className="h-3.5 w-3.5 text-mid-green"
                        strokeWidth={1.6}
                      />
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
                            updateMapPoc(index, {
                              email: event.target.value,
                            })
                          }
                          placeholder="Email"
                          className="rounded-md border border-dark-primary/10 bg-background px-2 py-1.5 text-sm outline-none focus:border-mid-green"
                        />
                        <input
                          value={contact.phone}
                          onChange={(event) =>
                            updateMapPoc(index, {
                              phone: event.target.value,
                            })
                          }
                          placeholder="Phone"
                          className="rounded-md border border-dark-primary/10 bg-background px-2 py-1.5 text-sm outline-none focus:border-mid-green"
                        />
                      </div>
                    </div>
                  ))}
                </section>
              ) : null}

              <input
                value={mapForm.keywords}
                onChange={(event) =>
                  setMapForm((current) => ({
                    ...current,
                    keywords: event.target.value,
                  }))
                }
                placeholder="Keywords (optional, shared)"
                className="w-full rounded-lg border border-dark-primary/10 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-mid-green"
              />
            </div>

            <div className="flex shrink-0 justify-end gap-2 border-t border-light-green/20 bg-white/50 px-5 py-3">
              <button
                type="button"
                onClick={() => setMapOpen(false)}
                className="rounded-xl px-3.5 py-2 text-sm font-medium text-mid-green transition hover:bg-light-green/20"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={
                  mapSaving ||
                  mapVendorLoading ||
                  (mapForm.mode === "existing" &&
                    mapForm.vendorIds.length === 0)
                }
                className="rounded-xl bg-mid-green px-3.5 py-2 text-sm font-medium text-background transition hover:bg-dark-secondary disabled:opacity-60"
              >
                {mapSaving
                  ? "Saving…"
                  : mapForm.mode === "existing" &&
                      mapForm.vendorIds.length > 1
                    ? `Save ${mapForm.vendorIds.length} mappings`
                    : "Save mapping"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {assignOpen && selectedVendor ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-dark-primary/45 p-4 backdrop-blur-[2px]">
          <form
            onSubmit={submitCategoryAssign}
            className="flex w-full max-w-7xl flex-col overflow-hidden rounded-2xl border border-light-green/25 bg-background shadow-[0_24px_64px_rgba(11,43,38,0.22)] animate-[login-fade-up_0.3s_ease-out]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="assign-category-title"
          >
            <div className="flex items-center justify-between gap-4 border-b border-light-green/20 bg-white/70 px-5 py-3.5">
              <div className="min-w-0">
                <h2
                  id="assign-category-title"
                  className="truncate text-base font-semibold text-dark-primary"
                >
                  Assign category
                  <span className="ml-2 font-normal text-mid-green">
                    · {selectedVendor.name}
                  </span>
                </h2>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAssignOpen(false)}
                  className="rounded-xl px-3.5 py-1.5 text-sm font-medium text-mid-green transition hover:bg-light-green/20"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    assignSaving ||
                    (assignForm.subcategories.length === 0 &&
                      !(selectedVendor?.categories || []).some(
                        (row) => row.category === assignForm.category
                      ))
                  }
                  className="rounded-xl bg-mid-green px-3.5 py-1.5 text-sm font-medium text-background transition hover:bg-dark-secondary disabled:opacity-50"
                >
                  {assignSaving
                    ? "Saving…"
                    : assignForm.subcategories.length > 1
                      ? `Save ${assignForm.subcategories.length} mappings`
                      : assignForm.subcategories.length === 0
                        ? "Save (unlink all)"
                        : "Save mapping"}
                </button>
                <button
                  type="button"
                  onClick={() => setAssignOpen(false)}
                  className="rounded-xl p-1.5 text-mid-green transition hover:bg-light-green/20"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" strokeWidth={1.6} />
                </button>
              </div>
            </div>

            <div className="grid gap-4 p-5 lg:grid-cols-3">
              <section className="min-w-0 space-y-3 rounded-2xl border border-light-green/25 bg-white/80 p-4 shadow-[0_4px_16px_rgba(11,43,38,0.04)]">
                <label className="block text-xs">
                  <span className="mb-1 block font-medium text-mid-green">
                    Category
                  </span>
                  <select
                    value={assignForm.category}
                    onChange={(event) =>
                      setAssignForm(
                        assignFormFromVendor(
                          selectedVendor,
                          event.target.value
                        )
                      )
                    }
                    className="h-9 w-full rounded-xl border border-light-green/35 bg-white px-2.5 text-sm outline-none transition focus:border-mid-green focus:ring-2 focus:ring-mid-green/15"
                  >
                    {PRODUCT_CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </label>

                <div>
                  <p className="mb-1.5 text-xs font-medium text-mid-green">
                    Subcategories
                    {assignForm.subcategories.length > 0
                      ? ` · ${assignForm.subcategories.length} selected`
                      : ""}
                  </p>
                  {subcategoryOptionsForAssign.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-light-green/40 px-3 py-2 text-xs text-mid-green">
                      No subcategories yet — add one below.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {subcategoryOptionsForAssign.map((subcategory) => {
                        const checked =
                          assignForm.subcategories.includes(subcategory);
                        const removing =
                          assignRemovingSubcategory === subcategory;
                        return (
                          <div
                            key={subcategory}
                            className={`rounded-lg border p-2 ${
                              checked
                                ? "border-mid-green/40 bg-mid-green/5"
                                : "border-light-green/35 bg-white"
                            }`}
                          >
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() =>
                                  toggleAssignSubcategory(subcategory)
                                }
                                className={`min-w-0 flex-1 truncate rounded-md px-2 py-1 text-left text-xs font-medium ${
                                  checked
                                    ? "bg-mid-green text-background"
                                    : "bg-light-green/15 text-dark-primary hover:bg-light-green/25"
                                }`}
                              >
                                {subcategory}
                                {checked ? " · selected" : ""}
                              </button>
                              <button
                                type="button"
                                disabled={removing}
                                onClick={() =>
                                  void removeAssignSubcategory(subcategory)
                                }
                                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-mid-green hover:bg-light-green/25 disabled:opacity-50"
                                aria-label={`Unlink ${subcategory}`}
                                title="Unlink this vendor from subcategory"
                              >
                                <Trash2
                                  className="h-3.5 w-3.5"
                                  strokeWidth={1.6}
                                />
                              </button>
                            </div>
                            {checked ? (
                              <input
                                value={
                                  assignForm.subcategoryKeywords[
                                    subcategory
                                  ] || ""
                                }
                                onChange={(event) =>
                                  updateAssignSubcategoryKeywords(
                                    subcategory,
                                    event.target.value
                                  )
                                }
                                placeholder="Keywords (comma separated)"
                                className="mt-1.5 h-8 w-full rounded-lg border border-light-green/40 bg-white px-2.5 text-xs outline-none focus:border-mid-green"
                              />
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div className="mt-2 space-y-1.5 rounded-lg border border-dashed border-light-green/40 p-2">
                    <p className="text-[11px] font-medium text-mid-green">
                      Add & map subcategory
                    </p>
                    <p className="text-[10px] text-mid-green">
                      Saves to taxonomy and maps this vendor immediately.
                    </p>
                    <input
                      value={assignCustomSubcategory}
                      onChange={(event) =>
                        setAssignCustomSubcategory(event.target.value)
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void addCustomAssignSubcategory();
                        }
                      }}
                      placeholder="Subcategory name"
                      className="h-8 w-full rounded-lg border border-light-green/40 bg-white px-2.5 text-xs outline-none focus:border-mid-green"
                    />
                    <input
                      value={assignCustomKeywords}
                      onChange={(event) =>
                        setAssignCustomKeywords(event.target.value)
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void addCustomAssignSubcategory();
                        }
                      }}
                      placeholder="Keywords (optional)"
                      className="h-8 w-full rounded-lg border border-light-green/40 bg-white px-2.5 text-xs outline-none focus:border-mid-green"
                    />
                    <button
                      type="button"
                      disabled={
                        assignAddingSubcategory ||
                        !assignCustomSubcategory.trim()
                      }
                      onClick={() => void addCustomAssignSubcategory()}
                      className="h-8 w-full rounded-lg border border-light-green/40 bg-white text-xs font-medium hover:bg-light-green/15 disabled:opacity-50"
                    >
                      {assignAddingSubcategory
                        ? "Saving…"
                        : "Add & map subcategory"}
                    </button>
                  </div>
                </div>
              </section>

              <section className="min-w-0 space-y-2 rounded-2xl border border-light-green/25 bg-white/80 p-4 shadow-[0_4px_16px_rgba(11,43,38,0.04)]">
                <p className="text-xs font-medium text-mid-green">
                  Available POCs
                  {availablePocs.length > 0
                    ? ` · ${availablePocs.length}`
                    : ""}
                </p>
                {assignForm.subcategories.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-light-green/35 px-3 py-6 text-center text-xs text-mid-green">
                    Select subcategories to load contacts.
                  </p>
                ) : availablePocsLoading ? (
                  <p className="rounded-lg border border-dashed border-light-green/35 px-3 py-6 text-center text-xs text-mid-green">
                    Loading…
                  </p>
                ) : availablePocs.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-light-green/35 px-3 py-6 text-center text-xs text-mid-green">
                    No existing POCs. Enter one in Mapping POCs.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {availablePocs.map((contact) => {
                      const alreadyUsed = assignForm.contacts.some(
                        (row) =>
                          pocKey({
                            name: row.name,
                            email: row.email,
                            phone: row.phone,
                          }) ===
                          pocKey({
                            name: contact.name,
                            email: contact.email,
                            phone: contact.phone,
                          })
                      );
                      const scopeLabel = !contact.vendorCategoryId
                        ? "Company contact"
                        : [contact.category, contact.subcategory]
                            .filter(Boolean)
                            .join(" / ") || "Mapped contact";
                      return (
                        <button
                          key={pocKey(contact)}
                          type="button"
                          disabled={alreadyUsed}
                          onClick={() => useAvailablePoc(contact)}
                          className={`w-full rounded-lg border p-3 text-left transition ${
                            alreadyUsed
                              ? "border-mid-green/25 bg-mid-green/10"
                              : "border-light-green/40 bg-white hover:border-mid-green hover:bg-light-green/10"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="truncate text-sm font-medium text-dark-primary">
                              {contact.name || "Unnamed POC"}
                            </p>
                            <span
                              className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                                alreadyUsed
                                  ? "bg-mid-green/20 text-mid-green"
                                  : "bg-light-green/30 text-dark-secondary"
                              }`}
                            >
                              {alreadyUsed ? "Added" : "Use"}
                            </span>
                          </div>
                          <p className="mt-0.5 truncate text-[11px] text-mid-green">
                            {contact.role || "Category POC"}
                            {contact.isPrimary ? " · Primary" : ""}
                          </p>
                          <div className="mt-2 space-y-0.5 text-[11px] text-dark-secondary">
                            <p className="truncate">
                              {contact.email || "No email"}
                            </p>
                            <p className="truncate">
                              {contact.phone || "No phone"}
                            </p>
                          </div>
                          <p className="mt-2 truncate text-[10px] text-mid-green">
                            {scopeLabel}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>

              <section className="min-w-0 space-y-2 rounded-2xl border border-light-green/25 bg-white/80 p-4 shadow-[0_4px_16px_rgba(11,43,38,0.04)]">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-mid-green">
                    Mapping POCs
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      setAssignForm((current) => ({
                        ...current,
                        contacts: [...current.contacts, emptyPoc()],
                      }))
                    }
                    className="inline-flex items-center gap-1 rounded-md border border-light-green/40 bg-white px-2 py-1 text-[11px] font-medium hover:bg-light-green/15"
                  >
                    <Plus className="h-3 w-3" strokeWidth={1.6} />
                    Add
                  </button>
                </div>
                <div className="space-y-2">
                  {assignForm.contacts.map((contact, index) => (
                    <div
                      key={index}
                      className="rounded-lg border border-light-green/30 bg-white p-3"
                    >
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="text-[11px] font-medium text-mid-green">
                          POC {index + 1}
                        </p>
                        {assignForm.contacts.length > 1 ? (
                          <button
                            type="button"
                            onClick={() =>
                              setAssignForm((current) => ({
                                ...current,
                                contacts: current.contacts.filter(
                                  (_, contactIndex) => contactIndex !== index
                                ),
                              }))
                            }
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-mid-green hover:bg-light-green/20"
                            aria-label="Remove POC"
                          >
                            <Trash2
                              className="h-3.5 w-3.5"
                              strokeWidth={1.6}
                            />
                          </button>
                        ) : null}
                      </div>
                      <div className="grid grid-cols-1 gap-2">
                        <input
                          value={contact.name}
                          onChange={(event) =>
                            updateAssignPoc(index, {
                              name: event.target.value,
                            })
                          }
                          placeholder="Name"
                          className="h-8 w-full rounded-lg border border-light-green/40 bg-white px-2.5 text-xs outline-none focus:border-mid-green"
                        />
                        <input
                          value={contact.role}
                          onChange={(event) =>
                            updateAssignPoc(index, {
                              role: event.target.value,
                            })
                          }
                          placeholder="Role"
                          className="h-8 w-full rounded-lg border border-light-green/40 bg-white px-2.5 text-xs outline-none focus:border-mid-green"
                        />
                        <input
                          type="email"
                          value={contact.email}
                          onChange={(event) =>
                            updateAssignPoc(index, {
                              email: event.target.value,
                            })
                          }
                          placeholder="Email"
                          className="h-8 w-full rounded-lg border border-light-green/40 bg-white px-2.5 text-xs outline-none focus:border-mid-green"
                        />
                        <input
                          value={contact.phone}
                          onChange={(event) =>
                            updateAssignPoc(index, {
                              phone: event.target.value,
                            })
                          }
                          placeholder="Phone"
                          className="h-8 w-full rounded-lg border border-light-green/40 bg-white px-2.5 text-xs outline-none focus:border-mid-green"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
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
