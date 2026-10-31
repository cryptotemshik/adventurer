import type { Metadata } from "next";
import { AdminPanel } from "./AdminPanel";

export const metadata: Metadata = { title: "admin", robots: { index: false } };

export default function AdminPage() {
  return <AdminPanel />;
}
