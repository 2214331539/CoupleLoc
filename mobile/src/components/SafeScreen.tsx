import { Platform, StatusBar, StyleSheet, View, type ViewProps } from "react-native";

export function SafeScreen({ children, style, ...props }: ViewProps) {
  return (
    <View {...props} style={[styles.safe, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    paddingTop: Platform.OS === "android" ? StatusBar.currentHeight ?? 0 : 0
  }
});
