type LearnHubNativeComponent = (props: Record<string, unknown>) => JSX.Element;

declare module "react-native" {
  export const ActivityIndicator: LearnHubNativeComponent;
  export const Button: LearnHubNativeComponent;
  export const Platform: { OS: string };
  export const Pressable: LearnHubNativeComponent;
  export const SafeAreaView: LearnHubNativeComponent;
  export const ScrollView: LearnHubNativeComponent;
  export const StyleSheet: { create<T>(styles: T): T };
  export const Text: LearnHubNativeComponent;
  export const TextInput: LearnHubNativeComponent;
  export const View: LearnHubNativeComponent;
}