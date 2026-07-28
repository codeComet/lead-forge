import { LayoutDashboard, Search, Users, Send, Settings } from "lucide-react";

// Single source of truth for primary nav + command palette.
export const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/search", label: "Find leads", icon: Search },
  { href: "/leads", label: "CRM pipeline", icon: Users },
  { href: "/campaigns", label: "Campaigns", icon: Send },
  { href: "/settings", label: "Settings", icon: Settings },
];
