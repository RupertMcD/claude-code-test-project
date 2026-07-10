import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { useCreateManual } from "../src/api";
import { useColors, type Colors } from "../src/theme";

export default function Manual() {
  const c = useColors();
  const router = useRouter();
  const create = useCreateManual();
  const [name, setName] = useState("");
  const [balance, setBalance] = useState("");
  const [kind, setKind] = useState<"ASSET" | "LIABILITY">("ASSET");
  const styles = makeStyles(c);

  async function save() {
    const amount = Number(balance.replace(/[^0-9.-]/g, ""));
    if (!name.trim() || Number.isNaN(amount)) {
      Alert.alert("Missing details", "Enter a name and a balance.");
      return;
    }
    try {
      await create.mutateAsync({ name: name.trim(), kind, balance: amount, currency: "GBP" });
      router.back();
    } catch (e) {
      Alert.alert("Couldn't save", String((e as Error)?.message ?? e));
    }
  }

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 16 }}>
      <Text style={styles.hint}>
        For accounts that don't connect automatically — e.g. St. James's Place or Moneybox. Update
        the balance whenever you like.
      </Text>

      <Text style={styles.label}>Name</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="e.g. St. James's Place ISA"
        placeholderTextColor={c.muted}
        style={styles.input}
      />

      <Text style={styles.label}>Balance (£)</Text>
      <TextInput
        value={balance}
        onChangeText={setBalance}
        placeholder="0.00"
        placeholderTextColor={c.muted}
        keyboardType="decimal-pad"
        style={styles.input}
      />

      <Text style={styles.label}>Type</Text>
      <View style={styles.toggleRow}>
        <Pressable
          style={[styles.toggle, kind === "ASSET" && styles.toggleOn]}
          onPress={() => setKind("ASSET")}
        >
          <Text style={[styles.toggleText, kind === "ASSET" && styles.toggleTextOn]}>Asset</Text>
        </Pressable>
        <Pressable
          style={[styles.toggle, kind === "LIABILITY" && styles.toggleOn]}
          onPress={() => setKind("LIABILITY")}
        >
          <Text style={[styles.toggleText, kind === "LIABILITY" && styles.toggleTextOn]}>
            Liability
          </Text>
        </Pressable>
      </View>

      <Pressable style={styles.save} onPress={save} disabled={create.isPending}>
        {create.isPending ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.saveText}>Save account</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    hint: { color: c.muted, fontSize: 13, lineHeight: 18, marginBottom: 16 },
    label: { color: c.muted, fontSize: 13, marginBottom: 6, marginTop: 12 },
    input: {
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      color: c.text,
      fontSize: 16,
    },
    toggleRow: { flexDirection: "row", gap: 10 },
    toggle: {
      flex: 1,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: "center",
    },
    toggleOn: { backgroundColor: c.accent, borderColor: c.accent },
    toggleText: { color: c.text, fontWeight: "600" },
    toggleTextOn: { color: "#fff" },
    save: {
      backgroundColor: c.accent,
      borderRadius: 12,
      paddingVertical: 16,
      alignItems: "center",
      marginTop: 28,
    },
    saveText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  });
}
