import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { Header } from "@/components/layout/header";
import { getSession } from "@/lib/auth";
import { CurrencyProvider } from "@/components/providers/currency-provider";
import { type CurrencyCode, DEFAULT_CURRENCY } from "@fintrack/shared/currencies";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  const currency = (session?.user?.currency as CurrencyCode) ?? DEFAULT_CURRENCY;

  return (
    <CurrencyProvider currency={currency}>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <Header />
          <main className="flex-1 overflow-auto p-4 md:p-6">{children}</main>
        </SidebarInset>
      </SidebarProvider>
    </CurrencyProvider>
  );
}
