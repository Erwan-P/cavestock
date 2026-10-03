export type CellarCategory = {
  id: string;
  name: string;
  position: number;
};

export type CellarMovement = {
  id: string;
  kind: "ENTRY" | "EXIT";
  quantity: number;
  createdAt: string;
  movementDate: string | null;
};

export type CellarWine = {
  id: string;
  categoryId: string;
  region: string;
  appellation: string;
  domaine: string;
  vintage: number;
  quantity: number;
  cuvee: string | null;
  purchasePrice: string | null;
  comment: string | null;
  movements: CellarMovement[];
};

export type CellarData = {
  categories: CellarCategory[];
  wines: CellarWine[];
  stats: {
    totalBottles: number;
    stockIn: number;
    stockOut: number;
    oldestVintage: number | null;
    year: number;
  };
};
