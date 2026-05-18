import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

function manualChunks(id: string) {
  if (!id.includes("node_modules")) return;

  if (
    id.includes("pdf-lib") ||
    id.includes("@pdfsmaller/pdf-encrypt")
  ) {
    return "pdf-lib-stack";
  }

  if (
    id.includes("jspdf") ||
    id.includes("html2canvas")
  ) {
    return "jspdf-stack";
  }

  if (id.includes("qrcode")) {
    return "qrcode-stack";
  }

  if (
    id.includes("@tiptap") ||
    id.includes("katex") ||
    id.includes("dompurify")
  ) {
    return "editor-stack";
  }

  return "vendor";
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks,
      },
    },
  },
}));
