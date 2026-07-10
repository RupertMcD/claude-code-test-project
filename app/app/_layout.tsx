import { Stack } from "expo-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useColorScheme } from "react-native";

const queryClient = new QueryClient();

export default function RootLayout() {
  const dark = useColorScheme() === "dark";
  const bg = dark ? "#0f1216" : "#f5f6f8";
  const text = dark ? "#e8eaed" : "#101418";
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <StatusBar style={dark ? "light" : "dark"} />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: bg },
            headerTintColor: text,
            headerShadowVisible: false,
            contentStyle: { backgroundColor: bg },
          }}
        >
          <Stack.Screen name="index" options={{ title: "Household net worth" }} />
          <Stack.Screen name="connect" options={{ title: "Connect a bank", presentation: "modal" }} />
          <Stack.Screen name="manual" options={{ title: "Add manual account", presentation: "modal" }} />
        </Stack>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
