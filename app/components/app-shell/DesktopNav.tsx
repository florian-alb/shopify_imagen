import { Link } from "@tanstack/react-router";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { AppLogo } from "./AppLogo";
import { LogoutButton } from "./LogoutButton";
import { navGroups } from "./navigation";
import { ShopSwitcher } from "./ShopSwitcher";

export function DesktopNav() {
  return (
    <Sidebar
      collapsible="icon"
      className="border-r border-white/10 bg-sidebar text-sidebar-foreground"
    >
      <SidebarHeader className="gap-5 px-4 pb-5 pt-6 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-2">
        <div className="flex items-start justify-between gap-2 group-data-[collapsible=icon]:justify-center">
          <Link
            to="/products"
            className="flex min-w-0 items-center gap-3 group-data-[collapsible=icon]:hidden"
          >
            <AppLogo />
            <span className="min-w-0">
              <span className="mt-1 block whitespace-nowrap text-xl font-semibold">
                Image Studio
              </span>
            </span>
          </Link>
          <SidebarTrigger className="mt-0.5 shrink-0 text-muted-foreground" />
        </div>
        <div className="group-data-[collapsible=icon]:hidden">
          <ShopSwitcher />
        </div>
      </SidebarHeader>

      <SidebarContent className="px-3 group-data-[collapsible=icon]:px-0">
        {navGroups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupContent>
              <SidebarMenu className="gap-1">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton
                        asChild
                        tooltip={item.label}
                        className="h-10 gap-3 rounded-lg text-muted-foreground transition data-[active=true]:bg-primary/15 data-[active=true]:text-primary hover:bg-white/5"
                      >
                        <Link
                          to={item.to}
                          activeProps={{ "data-active": true }}
                        >
                          <Icon />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="gap-3 px-3 pb-4 group-data-[collapsible=icon]:px-0">
        <SidebarMenu>
          <SidebarMenuItem>
            <LogoutButton desktop />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
