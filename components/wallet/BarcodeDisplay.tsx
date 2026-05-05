import { View, StyleSheet } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

interface BarcodeDisplayProps {
  barcode: string;
  size?: number;
}

export function BarcodeDisplay({ barcode, size = 180 }: BarcodeDisplayProps) {
  return (
    <View style={styles.container}>
      <QRCode value={barcode} size={size} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    // QR codes require white background for scanner contrast — intentionally not theme-derived
    backgroundColor: 'white',
    padding: 12,
    borderRadius: 8,
  },
});
