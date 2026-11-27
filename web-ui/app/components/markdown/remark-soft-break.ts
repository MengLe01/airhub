/**
 * 段落内的软换行（单个 `\n`）渲染成真正的换行。
 *
 * CommonMark 规定段落里的换行只是「软换行」，渲染时并成空格，
 * 所以 `a\nb` 会显示成一行。App 端（BetterText）开着 `softBreakAsLineBreak`，
 * 单个换行就是换行；这里补上同一语义，两端显示才一致。
 *
 * 只处理行内容器的直接文本子节点，代码块、行内代码和公式都不会被碰到。
 */

interface MdNode {
  type: string;
  value?: string;
  children?: MdNode[];
}

/** children 是行内内容的节点，其中的换行才需要变成 break */
const INLINE_CONTAINERS = new Set([
  "paragraph",
  "heading",
  "tableCell",
  "emphasis",
  "strong",
  "link",
  "delete",
]);

function splitText(node: MdNode): MdNode[] {
  const value = node.value;
  if (!value || !value.includes("\n")) return [node];

  const result: MdNode[] = [];
  const parts = value.split("\n");
  parts.forEach((part, index) => {
    if (part) result.push({ ...node, value: part });
    if (index < parts.length - 1) result.push({ type: "break" });
  });
  return result;
}

function walk(node: MdNode) {
  if (!node.children) return;

  if (INLINE_CONTAINERS.has(node.type)) {
    const children: MdNode[] = [];
    for (const child of node.children) {
      if (child.type === "text") {
        children.push(...splitText(child));
      } else {
        walk(child);
        children.push(child);
      }
    }
    node.children = children;
    return;
  }

  for (const child of node.children) walk(child);
}

export default function remarkSoftBreak() {
  return (tree: unknown) => {
    walk(tree as MdNode);
  };
}
