import { House, FolderOpen, FileText, History, CircleHelp } from "lucide-react";

// The dashboard's sections, once the application is submitted. While the
// student is still going through the steps, the shell shows no tabs.
export const DASHBOARD_TABS = [
  { id: "home",        label: "Overview",       short: "Overview",    icon: House },
  { id: "documents",   label: "Documents",      short: "Documents",   icon: FolderOpen },
  { id: "application", label: "My application", short: "Application", icon: FileText },
  { id: "activity",    label: "Activity",       short: "Activity",    icon: History },
  { id: "help",        label: "Help",           short: "Help",        icon: CircleHelp },
];
