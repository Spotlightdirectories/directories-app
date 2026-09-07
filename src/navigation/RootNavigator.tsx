// ===============================================================
// src/navigation/RootNavigator.tsx
// ===============================================================

import { createNativeStackNavigator } from "@react-navigation/native-stack";
import HomeScreen from "../screens/HomeScreen";
import AccountTypeScreen from "../screens/auth/AccountTypeScreen";
import VendorLoginScreen from "../screens/auth/VendorLoginScreen";
import CustomerLoginScreen from "../screens/auth/CustomerLoginScreen";
import LoggedInScreen from "../screens/auth/LoggedInScreen";
import SearchHistoryScreen from "../screens/customer/SearchHistoryScreen";
import ResultsScreen from "../screens/discover/ResultsScreen";
import VendorProfileScreen from "../screens/discover/VendorProfileScreen";

export type RootStackParamList = {
  Home: undefined;
  AccountType: undefined;
  VendorLogin: undefined;
  CustomerLogin: undefined;
  LoggedIn: { role: "vendor" | "customer"; name: string };
  SearchHistory: undefined;
  Results: { audience?: string; subgroup?: string; category?: string; subcategory?: string; subsubcategory?: string; keyword?: string };
  VendorProfile: { slug: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Home" component={HomeScreen} />
      <Stack.Screen name="AccountType" component={AccountTypeScreen} />
      <Stack.Screen name="VendorLogin" component={VendorLoginScreen} />
      <Stack.Screen name="CustomerLogin" component={CustomerLoginScreen} />
      <Stack.Screen name="LoggedIn" component={LoggedInScreen} />
      <Stack.Screen name="SearchHistory" component={SearchHistoryScreen} />
      <Stack.Screen name="Results" component={ResultsScreen} />
      <Stack.Screen name="VendorProfile" component={VendorProfileScreen} />
    </Stack.Navigator>
  );
}
