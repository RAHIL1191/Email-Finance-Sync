import { Feather, FontAwesome5, MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";

import { TxIconMeta, getTxIconMeta } from "@/utils/txIconResolver";

interface Props {
  title?: string | null;
  merchant?: string | null;
  category?: string | null;
  type?: string | null;
  size?: number;
  iconSize?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Modern glowing avatar for transactions and merchants:
 * - Auto-detects brands (Walmart, Costco, Netflix, Spotify, Starbucks, Shell, Banks, etc.)
 * - Recognizes context (Cafe vs Dine In restaurant vs Groceries vs Transit)
 * - Emits a soft, vibrant glowing colored halo with matching translucent backdrop
 */
export default function TransactionAvatar({
  title,
  merchant,
  category,
  type,
  size = 42,
  iconSize = 20,
  style,
}: Props) {
  const meta = React.useMemo<TxIconMeta>(() => {
    return getTxIconMeta(title, merchant, category, type);
  }, [title, merchant, category, type]);

  const borderRadius = Math.round(size * 0.32);

  const renderIcon = () => {
    if (meta.iconSet === "FontAwesome5") {
      return (
        <FontAwesome5
          name={meta.iconName as any}
          size={iconSize}
          color={meta.color}
        />
      );
    }
    if (meta.iconSet === "Feather") {
      return (
        <Feather
          name={meta.iconName as any}
          size={iconSize}
          color={meta.color}
        />
      );
    }
    return (
      <MaterialCommunityIcons
        name={meta.iconName as any}
        size={iconSize}
        color={meta.color}
      />
    );
  };

  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius,
          backgroundColor: meta.bgColor,
          borderColor: meta.borderColor,
          shadowColor: meta.color,
        },
        style,
      ]}
    >
      {renderIcon()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1.2,
    alignItems: "center",
    justifyContent: "center",
    // Glowing ambient shadow
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 4,
  },
});
