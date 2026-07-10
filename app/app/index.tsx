import { useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNetWorth, useHistory, useDeleteManual, type Account, type Snapshot } from "../src/api";
import { useColors, money, type Colors } from "../src/theme";

export default function Home() {
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const nw = useNetWorth();
  const hist = useHistory("GBP");
  const del = useDeleteManual();

  const onRefresh = useCallback(() => {
    nw.refetch();
    hist.refetch();
  }, [nw, hist]);

  const currencies = nw.data?.currencies ?? {};
  const primary = currencies.GBP ? "GBP" : Object.keys(currencies)[0];
  const totals = primary ? currencies[primary] : undefined;
  const accounts: Account[] = nw.data?.accounts ?? [];

  const styles = makeStyles(c);

  return (
    <ScrollView
      style={{ backgroundColor: c.bg }}
      contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}
      refreshControl={
        <RefreshControl refreshing={nw.isFetching || hist.isFetching} onRefresh={onRefresh} tintColor={c.muted} />
      }
    >
      {nw.isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={c.accent} />
        </View>
      ) : nw.isError ? (
        <View style={[styles.card, { borderColor: c.danger }]}>
          <Text style={[styles.cardTitle, { color: c.danger }]}>Can't reach the backend</Text>
          <Text style={styles.muted}>{String((nw.error as Error)?.message ?? "Unknown error")}</Text>
          <Text style={[styles.muted, { marginTop: 8 }]}>
            Make sure the server is running and EXPO_PUBLIC_API_URL points to it.
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.hero}>
            <Text style={styles.heroLabel}>Net worth{primary ? ` · ${primary}` : ""}</Text>
            <Text style={styles.heroValue}>{money(totals?.net ?? 0, primary ?? "GBP")}</Text>
            <View style={styles.heroRow}>
              <Text style={[styles.pill, { color: c.accent }]}>Assets {money(totals?.assets ?? 0, primary ?? "GBP")}</Text>
              <Text style={[styles.pill, { color: c.danger }]}>Owe {money(totals?.liabilities ?? 0, primary ?? "GBP")}</Text>
            </View>
          </View>

          <Sparkline data={hist.data ?? []} c={c} />

          <View style={styles.actions}>
            <Pressable style={styles.btnPrimary} onPress={() => router.push("/connect")}>
              <Text style={styles.btnPrimaryText}>Connect a bank</Text>
            </Pressable>
            <Pressable style={styles.btnGhost} onPress={() => router.push("/manual")}>
              <Text style={styles.btnGhostText}>Add manual account</Text>
            </Pressable>
          </View>

          <Text style={styles.sectionTitle}>Accounts</Text>
          {accounts.length === 0 ? (
            <View style={styles.card}>
              <Text style={styles.muted}>
                No accounts yet. Connect a bank (HSBC, Monzo, Amex…) or add a manual account for
                things like St. James's Place or Moneybox.
              </Text>
            </View>
          ) : (
            accounts.map((a) => (
              <AccountRow
                key={`${a.source}:${a.id}`}
                a={a}
                c={c}
                onDelete={a.source === "manual" ? () => del.mutate(a.id) : undefined}
              />
            ))
          )}
        </>
      )}
    </ScrollView>
  );
}

function AccountRow({ a, c, onDelete }: { a: Account; c: Colors; onDelete?: () => void }) {
  const styles = makeStyles(c);
  return (
    <View style={[styles.card, styles.row]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.accName}>{a.name ?? "Account"}</Text>
        <Text style={styles.badge}>
          {a.source === "manual" ? "Manual" : "Connected"}
          {a.type ? ` · ${a.type}` : ""}
        </Text>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Text style={[styles.accBalance, { color: a.isLiability ? c.danger : c.text }]}>
          {a.isLiability ? "-" : ""}
          {money(Math.abs(a.balance ?? 0), a.currency ?? "GBP")}
        </Text>
        {onDelete ? (
          <Pressable onPress={onDelete} hitSlop={8}>
            <Text style={[styles.badge, { color: c.danger }]}>Remove</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function Sparkline({ data, c }: { data: Snapshot[]; c: Colors }) {
  const styles = makeStyles(c);
  if (data.length < 2) {
    return (
      <View style={[styles.card, { alignItems: "center" }]}>
        <Text style={styles.muted}>Your net-worth trend will appear here as it's tracked daily.</Text>
      </View>
    );
  }
  const values = data.map((d) => d.net);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return (
    <View style={styles.card}>
      <Text style={styles.muted}>Net worth trend</Text>
      <View style={styles.spark}>
        {data.map((d, i) => {
          const h = 8 + ((d.net - min) / range) * 56;
          return <View key={i} style={{ flex: 1, height: h, marginHorizontal: 1, borderRadius: 2, backgroundColor: c.accent }} />;
        })}
      </View>
    </View>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    centered: { paddingVertical: 48, alignItems: "center" },
    hero: {
      backgroundColor: c.card,
      borderRadius: 16,
      padding: 20,
      borderWidth: 1,
      borderColor: c.border,
    },
    heroLabel: { color: c.muted, fontSize: 13, letterSpacing: 0.4, textTransform: "uppercase" },
    heroValue: { color: c.text, fontSize: 40, fontWeight: "800", marginTop: 6, letterSpacing: -1 },
    heroRow: { flexDirection: "row", gap: 16, marginTop: 10 },
    pill: { fontSize: 14, fontWeight: "600" },
    spark: { flexDirection: "row", alignItems: "flex-end", height: 64, marginTop: 10 },
    actions: { flexDirection: "row", gap: 10, marginTop: 16 },
    btnPrimary: { flex: 1, backgroundColor: c.accent, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
    btnPrimaryText: { color: "#fff", fontWeight: "700" },
    btnGhost: { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: "center", borderWidth: 1, borderColor: c.border },
    btnGhostText: { color: c.text, fontWeight: "600" },
    sectionTitle: { color: c.muted, fontSize: 13, textTransform: "uppercase", letterSpacing: 0.4, marginTop: 24, marginBottom: 8 },
    card: {
      backgroundColor: c.card,
      borderRadius: 12,
      padding: 16,
      borderWidth: 1,
      borderColor: c.border,
      marginBottom: 10,
    },
    row: { flexDirection: "row", alignItems: "center" },
    cardTitle: { fontSize: 16, fontWeight: "700", marginBottom: 4 },
    muted: { color: c.muted, fontSize: 14, lineHeight: 20 },
    accName: { color: c.text, fontSize: 16, fontWeight: "600" },
    accBalance: { fontSize: 16, fontWeight: "700" },
    badge: { color: c.muted, fontSize: 12, marginTop: 3 },
  });
}
