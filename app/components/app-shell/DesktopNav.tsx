import { Link } from "@tanstack/react-router";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
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
      className="border-r border-sidebar-border bg-sidebar text-sidebar-foreground"
    >
      <SidebarHeader className="gap-5 px-4 pb-3 pt-6 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-2">
        <div className="flex items-start justify-between gap-2 group-data-[collapsible=icon]:justify-center">
          <Link
            to="/products"
            className="flex min-w-0 items-center gap-2 group-data-[collapsible=icon]:hidden"
          >
            <AppLogo size="sm" />
            <span className="min-w-0">
              <span className="mt-0.5 block whitespace-nowrap text-base font-semibold tracking-tight">
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
            <SidebarGroupLabel className="h-7 px-2 text-[0.7rem] font-medium tracking-wide text-muted-foreground">{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-1">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton
                        asChild
                        tooltip={item.label}
                        className="h-9 gap-3 rounded-lg text-[0.8125rem] text-muted-foreground transition-colors data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-foreground data-[active=true]:shadow-xs data-[active=true]:[&>svg]:text-primary hover:bg-sidebar-accent"
                      >
                        <Link
                          to={item.to}
                          activeOptions={{ exact: item.to === "/settings" }}
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
