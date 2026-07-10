import { useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import * as WebBrowser from "expo-web-browser";
import { useAspsps, startAuth, type Aspsp } from "../src/api";
import { useColors, type Colors } from "../src/theme";

export default function Connect() {
  const c = useColors();
  const router = useRouter();
  const qc = useQueryClient();
  const aspsps = useAspsps("GB");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const styles = makeStyles(c);

  const list = useMemo(() => {
    const items: Aspsp[] = aspsps.data?.aspsps ?? [];
    const needle = q.trim().toLowerCase();
    return needle ? items.filter((a) => a.name.toLowerCase().includes(needle)) : items;
  }, [aspsps.data, q]);

  async function connect(bank: Aspsp) {
    try {
      setBusy(bank.name);
      const { url } = await startAuth(bank.name);
      await WebBrowser.openBrowserAsync(url);
      // The bank redirects to the backend /callback, which stores the accounts.
      // When the user returns, refresh the data and go home.
      qc.invalidateQueries({ queryKey: ["net-worth"] });
      qc.invalidateQueries({ queryKey: ["history"] });
      router.back();
    } catch (e) {
      Alert.alert("Couldn't start linking", String((e as Error)?.message ?? e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={styles.searchWrap}>
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search banks (HSBC, Monzo, Amex…)"
          placeholderTextColor={c.muted}
          style={styles.search}
          autoCorrect={false}
        />
      </View>
      {aspsps.isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={c.accent} />
        </View>
      ) : aspsps.isError ? (
        <View style={styles.centered}>
          <Text style={styles.muted}>Couldn't load the bank list.</Text>
          <Text style={[styles.muted, { marginTop: 6 }]}>
            {String((aspsps.error as Error)?.message ?? "")}
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <Text style={styles.hint}>
            Pick your bank, approve access in your banking app (Face ID), then come back.
          </Text>
          {list.map((bank: Aspsp) => (
            <Pressable key={bank.name} style={styles.row} onPress={() => connect(bank)}>
              <Text style={styles.bankName}>{bank.name}</Text>
              {busy === bank.name ? (
                <ActivityIndicator color={c.accent} />
              ) : (
                <Text style={styles.link}>Connect</Text>
              )}
            </Pressable>
          ))}
          {list.length === 0 ? <Text style={styles.muted}>No banks match "{q}".</Text> : null}
        </ScrollView>
      )}
    </View>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
    searchWrap: { padding: 16, paddingBottom: 8 },
    search: {
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      color: c.text,
      fontSize: 16,
    },
    hint: { color: c.muted, fontSize: 13, marginBottom: 12, lineHeight: 18 },
    row: {
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 16,
      marginBottom: 10,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    bankName: { color: c.text, fontSize: 16, fontWeight: "600", flex: 1 },
    link: { color: c.accent, fontWeight: "700" },
    muted: { color: c.muted, fontSize: 14, textAlign: "center" },
  });
}
