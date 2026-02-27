import { Node, mergeAttributes } from "@tiptap/react";

export const PlaceholderNode = Node.create({
  name: "placeholderNode",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      key: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-placeholder"),
        renderHTML: (attributes) => ({
          "data-placeholder": attributes.key,
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-placeholder]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        class: "placeholder-node",
        contenteditable: "false",
      }),
      `{{${HTMLAttributes["data-placeholder"]}}}`,
    ];
  },
});
