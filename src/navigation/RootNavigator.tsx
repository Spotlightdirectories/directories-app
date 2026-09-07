// ===============================================================
// src/navigation/RootNavigator.tsx
// ===============================================================

import { createNativeStackNavigator } from "@react-navigation/native-stack";
import HomeScreen from "../screens/HomeScreen";
import AccountTypeScreen from "../screens/auth/AccountTypeScreen";
import VendorLoginScreen from "../screens/auth/VendorLoginScreen";
import CustomerLoginScreen from "../screens/auth/CustomerLoginScreen";
import LoggedInScreen from "../screens/auth/LoggedInScreen";

export type RootStackParamList = {
  Home: undefined;
  AccountType: undefined;
  VendorLogin: undefined;
  CustomerLogin: undefined;
  LoggedIn: { role: "vendor" | "customer"; name: string };
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
    </Stack.Navigator>
  );
}
