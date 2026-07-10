import { useColorScheme } from "react-native";

const light = {
  bg: "#f5f6f8",
  card: "#ffffff",
  text: "#101418",
  muted: "#5b6470",
  accent: "#2f6f4f",
  danger: "#b23b3b",
  border: "#e6e8eb",
};

const dark = {
  bg: "#0f1216",
  card: "#171b20",
  text: "#e8eaed",
  muted: "#9aa3ad",
  accent: "#5fbf8f",
  danger: "#e07a7a",
  border: "#272c33",
};

export type Colors = typeof light;

export function useColors(): Colors {
  return useColorScheme() === "dark" ? dark : light;
}

export function money(n: number | null | undefined, ccy = "GBP"): string {
  if (n == null) return "—";
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency: ccy }).format(n);
  } catch {
    return `£${n.toFixed(2)}`;
  }
}
