import type { ThemeConfig } from "antd";
import { theme as antdTheme } from "antd";

export function getAntThemeConfig(dark = false): ThemeConfig {
  if (dark) {
    return {
      algorithm: antdTheme.darkAlgorithm,
      cssVar: { key: "stub-paper-theme" },
      token: {
        colorPrimary: "#ff5929",
        colorInfo: "#f2eee4",
        colorSuccess: "#46b874",
        colorWarning: "#e0a326",
        colorError: "#ec5b40",
        colorLink: "#ff7a52",
        colorLinkHover: "#ff5929",
        colorLinkActive: "#f2eee4",
        colorBgBase: "#141310",
        colorBgContainer: "#22201b",
        colorBgElevated: "#22201b",
        colorBgLayout: "#141310",
        colorTextBase: "#f2eee4",
        colorTextSecondary: "#b8b1a1",
        colorTextTertiary: "#7d7769",
        colorBorder: "#403c33",
        colorBorderSecondary: "#302d26",
        borderRadius: 4,
        fontFamily: '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
        controlItemBgHover: "rgba(242, 238, 228, 0.08)",
        controlItemBgActive: "rgba(242, 238, 228, 0.14)",
        controlItemBgActiveHover: "rgba(242, 238, 228, 0.18)",
      },
      components: {
        Button: {
          primaryShadow: "none",
          defaultBg: "#22201b",
          defaultBorderColor: "#403c33",
        },
        Card: {
          colorBgContainer: "#22201b",
          colorBorderSecondary: "#302d26",
        },
        Dropdown: {
          colorBgElevated: "#22201b",
          colorText: "#f2eee4",
          controlItemBgHover: "rgba(242, 238, 228, 0.08)",
          controlItemBgActive: "rgba(242, 238, 228, 0.14)",
          controlItemBgActiveHover: "rgba(242, 238, 228, 0.18)",
        },
        Menu: {
          popupBg: "#22201b",
          itemActiveBg: "rgba(242, 238, 228, 0.12)",
          itemHoverBg: "rgba(242, 238, 228, 0.08)",
          itemSelectedBg: "#f2eee4",
          itemSelectedColor: "#141310",
        },
        Select: {
          colorBgContainer: "#22201b",
          colorBgElevated: "#22201b",
          optionActiveBg: "rgba(242, 238, 228, 0.08)",
          optionSelectedBg: "rgba(242, 238, 228, 0.16)",
          optionSelectedColor: "#f2eee4",
        },
        Table: {
          headerBg: "#1c1a16",
          headerColor: "#7d7769",
          rowHoverBg: "#2a2721",
          rowSelectedBg: "rgba(242, 238, 228, 0.08)",
          rowSelectedHoverBg: "rgba(242, 238, 228, 0.12)",
          borderColor: "#302d26",
        },
        Modal: {
          contentBg: "#1c1a16",
          headerBg: "#1c1a16",
        },
        Drawer: {
          colorBgElevated: "#1c1a16",
        },
      },
    };
  }

  return {
    algorithm: antdTheme.defaultAlgorithm,
    cssVar: { key: "stub-paper-theme" },
    token: {
      colorPrimary: "#17150f",
      colorInfo: "#17150f",
      colorSuccess: "#2f7d4f",
      colorWarning: "#b97f00",
      colorError: "#c2361b",
      colorLink: "#c2330a",
      colorLinkHover: "#ff4d1a",
      colorLinkActive: "#17150f",
      colorBgBase: "#f2eee4",
      colorBgContainer: "#fbf9f4",
      colorBgElevated: "#fbf9f4",
      colorBgLayout: "#f2eee4",
      colorTextBase: "#17150f",
      colorTextSecondary: "#4a463c",
      colorTextTertiary: "#8a8475",
      colorBorder: "#c6bca5",
      colorBorderSecondary: "#d8d0bd",
      borderRadius: 4,
      fontFamily: '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
      controlItemBgHover: "rgba(23, 21, 15, 0.06)",
      controlItemBgActive: "rgba(23, 21, 15, 0.1)",
      controlItemBgActiveHover: "rgba(23, 21, 15, 0.14)",
    },
    components: {
      Button: {
        primaryShadow: "none",
        defaultBg: "#fbf9f4",
        defaultBorderColor: "#c6bca5",
      },
      Card: {
        colorBgContainer: "#fbf9f4",
        colorBorderSecondary: "#d8d0bd",
      },
      Dropdown: {
        colorBgElevated: "#fbf9f4",
        colorText: "#17150f",
        controlItemBgHover: "rgba(23, 21, 15, 0.06)",
        controlItemBgActive: "rgba(23, 21, 15, 0.1)",
        controlItemBgActiveHover: "rgba(23, 21, 15, 0.14)",
      },
      Menu: {
        popupBg: "#fbf9f4",
        itemActiveBg: "rgba(23, 21, 15, 0.1)",
        itemHoverBg: "rgba(23, 21, 15, 0.06)",
        itemSelectedBg: "#17150f",
        itemSelectedColor: "#f2eee4",
      },
      Select: {
        colorBgContainer: "#fbf9f4",
        colorBgElevated: "#fbf9f4",
        optionActiveBg: "rgba(23, 21, 15, 0.06)",
        optionSelectedBg: "rgba(23, 21, 15, 0.12)",
        optionSelectedColor: "#17150f",
      },
      Table: {
        headerBg: "#fbf9f4",
        headerColor: "#8a8475",
        rowHoverBg: "#ffffff",
        rowSelectedBg: "rgba(23, 21, 15, 0.05)",
        rowSelectedHoverBg: "rgba(23, 21, 15, 0.08)",
        borderColor: "#d8d0bd",
      },
      Modal: {
        contentBg: "#f2eee4",
        headerBg: "#f2eee4",
      },
      Drawer: {
        colorBgElevated: "#f2eee4",
      },
    },
  };
}
