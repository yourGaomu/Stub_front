import { createBrowserRouter, Navigate } from "react-router-dom";
import ConsoleLayout from "@/layouts/console-layout";
import AccountPage from "@/pages/account";
import AdminBusinessesPage from "@/pages/admin/businesses";
import AdminSecurityPage from "@/pages/admin/security";
import AdminSettingsPage from "@/pages/admin/settings";
import AdminUsersPage from "@/pages/admin/users";
import ApiKeysPage from "@/pages/api-keys";
import AssetsPage from "@/pages/assets";
import InvitesPage from "@/pages/invites";
import LandingPage from "@/pages/landing";
import LinksPage from "@/pages/links";
import LoginPage from "@/pages/login";
import LogsPage from "@/pages/logs";
import OverviewPage from "@/pages/overview";
import TemplatesPage from "@/pages/templates";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <LandingPage />,
  },
  {
    path: "/login",
    element: <LoginPage />,
  },
  {
    path: "/register",
    element: <LoginPage />,
  },
  {
    path: "/reset-password",
    element: <LoginPage />,
  },
  {
    path: "/console",
    element: <ConsoleLayout />,
    children: [
      { index: true, element: <OverviewPage /> },
      { path: "links", element: <LinksPage /> },
      { path: "assets", element: <AssetsPage /> },
      { path: "templates", element: <TemplatesPage /> },
      { path: "invites", element: <InvitesPage /> },
      { path: "api-keys", element: <ApiKeysPage /> },
      { path: "logs", element: <LogsPage /> },
      { path: "account", element: <AccountPage /> },
      { path: "admin/users", element: <AdminUsersPage /> },
      { path: "admin/businesses", element: <AdminBusinessesPage /> },
      { path: "admin/settings", element: <AdminSettingsPage /> },
      { path: "admin/security", element: <AdminSecurityPage /> },
    ],
  },
  {
    path: "*",
    element: <Navigate to="/" replace />,
  },
]);
