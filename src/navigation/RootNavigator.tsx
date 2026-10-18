// ===============================================================
// src/navigation/RootNavigator.tsx
// ===============================================================

import { createNativeStackNavigator } from "@react-navigation/native-stack";
import HomeScreen from "../screens/HomeScreen";
import AccountTypeScreen from "../screens/auth/AccountTypeScreen";
import VendorLoginScreen from "../screens/auth/VendorLoginScreen";
import CustomerLoginScreen from "../screens/auth/CustomerLoginScreen";
import CustomerSignupScreen from "../screens/auth/CustomerSignupScreen";
import LoggedInScreen from "../screens/auth/LoggedInScreen";
import CustomerDashboardScreen from "../screens/customer/CustomerDashboardScreen";
import SearchHistoryScreen from "../screens/customer/SearchHistoryScreen";
import FavoritesScreen from "../screens/customer/FavoritesScreen";
import MyReviewsScreen from "../screens/customer/MyReviewsScreen";
import RecentlyViewedScreen from "../screens/customer/RecentlyViewedScreen";
import MyInquiriesScreen from "../screens/customer/MyInquiriesScreen";
import MyVisitRequestsScreen from "../screens/customer/MyVisitRequestsScreen";
import MyQuoteRequestsScreen from "../screens/customer/MyQuoteRequestsScreen";
import ResultsScreen from "../screens/discover/ResultsScreen";
import VendorProfileScreen from "../screens/discover/VendorProfileScreen";
import ProductDetailScreen from "../screens/discover/ProductDetailScreen";
import ServiceDetailScreen from "../screens/discover/ServiceDetailScreen";
import DashboardHomeScreen from "../screens/vendor/DashboardHomeScreen";
import ProductsScreen from "../screens/vendor/ProductsScreen";
import ServicesScreen from "../screens/vendor/ServicesScreen";
import PortfolioScreen from "../screens/vendor/PortfolioScreen";
import VisitRequestsReceivedScreen from "../screens/vendor/VisitRequestsReceivedScreen";
import ProfileEditScreen from "../screens/vendor/ProfileEditScreen";

export type RootStackParamList = {
  Home: undefined;
  AccountType: undefined;
  VendorLogin: undefined;
  CustomerLogin: undefined;
  CustomerSignup: undefined;
  LoggedIn: { role: "vendor" | "customer"; name: string };
  CustomerDashboard: undefined;
  SearchHistory: undefined;
  Favorites: undefined;
  MyReviews: undefined;
  RecentlyViewed: undefined;
  MyInquiries: undefined;
  MyVisitRequests: undefined;
  MyQuoteRequests: undefined;
  Results: {
    audience?: string;
    subgroup?: string;
    category?: string;
    subcategory?: string;
    subsubcategory?: string;
    keyword?: string;
    searchType?: "all" | "product" | "service" | "vendor";
    state?: string;
    lga?: string;
    verifiedOnly?: boolean;
    distanceEnabled?: boolean;
    userLat?: number;
    userLng?: number;
    radius?: number;
  };
  VendorProfile: { slug: string; openReview?: boolean };
  ProductDetail: { vendorSlug: string; productSlug: string };
  ServiceDetail: { vendorSlug: string; serviceSlug: string };
  DashboardHome: undefined;
  Products: undefined;
  Services: undefined;
  Portfolio: undefined;
  VisitRequestsReceived: undefined;
  ProfileEdit: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Home" component={HomeScreen} />
      <Stack.Screen name="AccountType" component={AccountTypeScreen} />
      <Stack.Screen name="VendorLogin" component={VendorLoginScreen} />
      <Stack.Screen name="CustomerLogin" component={CustomerLoginScreen} />
      <Stack.Screen name="CustomerSignup" component={CustomerSignupScreen} />
      <Stack.Screen name="LoggedIn" component={LoggedInScreen} />
      <Stack.Screen name="CustomerDashboard" component={CustomerDashboardScreen} />
      <Stack.Screen name="SearchHistory" component={SearchHistoryScreen} />
      <Stack.Screen name="Favorites" component={FavoritesScreen} />
      <Stack.Screen name="MyReviews" component={MyReviewsScreen} />
      <Stack.Screen name="RecentlyViewed" component={RecentlyViewedScreen} />
      <Stack.Screen name="MyInquiries" component={MyInquiriesScreen} />
      <Stack.Screen name="MyVisitRequests" component={MyVisitRequestsScreen} />
      <Stack.Screen name="MyQuoteRequests" component={MyQuoteRequestsScreen} />
      <Stack.Screen name="Results" component={ResultsScreen} />
      <Stack.Screen name="VendorProfile" component={VendorProfileScreen} />
      <Stack.Screen name="ProductDetail" component={ProductDetailScreen} />
      <Stack.Screen name="ServiceDetail" component={ServiceDetailScreen} />
      <Stack.Screen name="DashboardHome" component={DashboardHomeScreen} />
      <Stack.Screen name="Products" component={ProductsScreen} />
      <Stack.Screen name="Services" component={ServicesScreen} />
      <Stack.Screen name="Portfolio" component={PortfolioScreen} />
      <Stack.Screen name="VisitRequestsReceived" component={VisitRequestsReceivedScreen} />
      <Stack.Screen name="ProfileEdit" component={ProfileEditScreen} />
    </Stack.Navigator>
  );
}
