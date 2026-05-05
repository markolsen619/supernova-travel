import { View, StyleSheet } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

interface BarcodeDisplayProps {
  barcode: string;
  size?: number;
}

export function BarcodeDisplay({ barcode, size = 180 }: BarcodeDisplayProps) {
  return (
    <View style={[styles.container, { backgroundColor: 'white', padding: 12, borderRadius: 8 }]}>
      <QRCode value={barcode} size={size} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
