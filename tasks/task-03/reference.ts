type CategoryInput = { id: string; parentId: string | null; name: string };
type CategoryNode = CategoryInput & { children: CategoryNode[] };

export function buildCategoryTree(items: readonly CategoryInput[]): CategoryNode[] {
  const nodes = new Map<string, CategoryNode>();
  for (const item of items) {
    nodes.set(item.id, { ...item, children: [] });
  }

  const roots: CategoryNode[] = [];
  for (const item of items) {
    const node = nodes.get(item.id);
    if (!node) {
      continue;
    }
    const parent = item.parentId === null ? undefined : nodes.get(item.parentId);
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}
