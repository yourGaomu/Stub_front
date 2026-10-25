import { App as AntdApp, ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import { RouterProvider } from "react-router-dom";
import { getAntThemeConfig } from "@/lib/app-theme";
import { router } from "@/router";
import { useThemeStore } from "@/stores/theme-store";

export default function App() {
  const dark = useThemeStore((s) => s.dark);

  return (
    <ConfigProvider locale={zhCN} theme={getAntThemeConfig(dark)}>
      <AntdApp>
        <RouterProvider router={router} />
      </AntdApp>
    </ConfigProvider>
  );
}
