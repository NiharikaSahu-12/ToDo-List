export type ThemeMode = "light" | "dark";

export const createThemeStore = () => {
  let mode = $state<ThemeMode>("light");

  return {
    get mode() {
      return mode;
    },
    set(value: ThemeMode) {
      mode = value;
      document.documentElement.dataset.theme = value;
      localStorage.setItem("daymark-theme", value);
    },
    toggle() {
      this.set(mode === "light" ? "dark" : "light");
    },
  };
};
