/**
 * Error boundary that catches render errors and displays a fallback UI
 * instead of a blank white screen.
 *
 * Used to wrap screens that may crash during render due to unexpected
 * state, missing data, or third-party library issues.
 */
import React, { Component, type ReactNode } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";

interface Props {
  children: ReactNode;
  /** Name shown in error logs for debugging */
  screenName?: string;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorMessage: "" };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error.message || String(error) };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    const name = this.props.screenName ?? "UnknownScreen";
    console.error(`[ErrorBoundary:${name}] RENDER CRASH:`, error.message);
    console.error(`[ErrorBoundary:${name}] Component stack:`, errorInfo.componentStack);
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, errorMessage: "" });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <View style={styles.card}>
            <Text style={styles.icon}>⚠️</Text>
            <Text style={styles.title}>Something went wrong</Text>
            <Text style={styles.message}>
              {this.state.errorMessage || "An unexpected error occurred while loading this screen."}
            </Text>
            <TouchableOpacity style={styles.button} onPress={this.handleRetry}>
              <Text style={styles.buttonText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F4F7F4",
    padding: 24,
  },
  card: {
    alignItems: "center",
    gap: 12,
  },
  icon: {
    fontSize: 48,
    marginBottom: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0F172A",
    textAlign: "center",
  },
  message: {
    fontSize: 14,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 8,
  },
  button: {
    backgroundColor: "#0F766E",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
  },
});
