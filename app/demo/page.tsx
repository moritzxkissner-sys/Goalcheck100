import Dashboard from "@/components/dashboard";
import { demoData } from "@/lib/demo";
export const dynamic = "force-dynamic";
export default function Demo() {
  return <Dashboard initial={demoData()} demo />;
}
