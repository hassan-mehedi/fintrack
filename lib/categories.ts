/**
 * Category tree helpers — pure, testable, no DB access.
 *
 * Each user's `categories` table is a flat list with self-referential
 * `parentId`. These helpers turn that into a tree, prevent cycles, and
 * walk it for analytics roll-ups.
 */

export type CategoryNode = {
  id: string;
  name: string;
  icon: string;
  color: string;
  type: "income" | "expense" | "both";
  parentId: string | null;
  sortOrder: number;
  archived: boolean;
  systemKey: string | null;
};

export type CategoryTreeNode = CategoryNode & {
  depth: number;
  children: CategoryTreeNode[];
};

/**
 * Returns the input as a forest of root nodes with `children` populated.
 * Nodes whose `parentId` points outside the input set are treated as roots.
 * Cycles are broken: if A → B → A would form a loop, the back-edge is
 * dropped (B becomes a root).
 */
export function buildCategoryTree(cats: CategoryNode[]): CategoryTreeNode[] {
  const byId = new Map<string, CategoryTreeNode>();
  for (const c of cats) {
    byId.set(c.id, { ...c, depth: 0, children: [] });
  }

  const roots: CategoryTreeNode[] = [];
  for (const node of byId.values()) {
    if (!node.parentId) {
      roots.push(node);
      continue;
    }
    const parent = byId.get(node.parentId);
    if (!parent || wouldFormCycle(node.id, parent.id, byId)) {
      // Orphan or would-be cycle: surface at root level.
      roots.push(node);
      continue;
    }
    parent.children.push(node);
  }

  // Set depths via BFS from roots, then sort each level by sortOrder + name.
  const sortChildren = (n: CategoryTreeNode) => {
    n.children.sort(
      (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
    );
    for (const c of n.children) {
      c.depth = n.depth + 1;
      sortChildren(c);
    }
  };
  roots.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  for (const r of roots) sortChildren(r);

  return roots;
}

function wouldFormCycle(
  candidateId: string,
  parentId: string,
  byId: Map<string, CategoryTreeNode>,
): boolean {
  // Walk up from parent — if we hit candidateId, attaching would close a cycle.
  let cursor: CategoryTreeNode | undefined = byId.get(parentId);
  const seen = new Set<string>();
  while (cursor) {
    if (cursor.id === candidateId) return true;
    if (seen.has(cursor.id)) return true; // pre-existing cycle in input
    seen.add(cursor.id);
    cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
  }
  return false;
}

/**
 * Flattens a tree back into a list in display order, prefixing names with
 * indentation. Useful for rendering nested categories in plain `<select>`.
 */
export function flattenForSelect(
  roots: CategoryTreeNode[],
  options?: { indent?: string },
): Array<CategoryTreeNode & { displayName: string }> {
  const indent = options?.indent ?? "— ";
  const out: Array<CategoryTreeNode & { displayName: string }> = [];
  const visit = (n: CategoryTreeNode) => {
    out.push({ ...n, displayName: indent.repeat(n.depth) + n.name });
    for (const c of n.children) visit(c);
  };
  for (const r of roots) visit(r);
  return out;
}

/**
 * Walks up from `id` to a root, returning the chain of ids (inclusive of
 * `id` and the root). Useful for "roll all spending in Food and its
 * subcategories up to Food" budget logic.
 */
export function ancestorChain(
  id: string,
  cats: CategoryNode[],
): string[] {
  const byId = new Map(cats.map((c) => [c.id, c]));
  const chain: string[] = [];
  const seen = new Set<string>();
  let cursor: CategoryNode | undefined = byId.get(id);
  while (cursor && !seen.has(cursor.id)) {
    chain.push(cursor.id);
    seen.add(cursor.id);
    cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
  }
  return chain;
}

/**
 * Returns the set of all descendant ids (NOT including `rootId`).
 * Used to roll spending of a parent category up to include its children.
 */
export function descendantIds(rootId: string, cats: CategoryNode[]): string[] {
  const childrenByParent = new Map<string, string[]>();
  for (const c of cats) {
    if (!c.parentId) continue;
    const arr = childrenByParent.get(c.parentId) ?? [];
    arr.push(c.id);
    childrenByParent.set(c.parentId, arr);
  }
  const out: string[] = [];
  const stack = [rootId];
  const seen = new Set<string>([rootId]);
  while (stack.length) {
    const id = stack.pop()!;
    for (const child of childrenByParent.get(id) ?? []) {
      if (seen.has(child)) continue;
      seen.add(child);
      out.push(child);
      stack.push(child);
    }
  }
  return out;
}
