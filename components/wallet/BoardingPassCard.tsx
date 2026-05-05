import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BoardingPass, BoardingPassStatus } from '@/types';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';

interface BoardingPassCardProps {
  pass: BoardingPass;
  onPress: () => void;
}

const STATUS_COLORS: Record<BoardingPassStatus, string> = {
  upcoming: '#60a5fa',
  checked_in: '#34d399',
  boarded: '#a78bfa',
  completed: 'rgba(255,255,255,0.4)',
  cancelled: '#f87171',
};

const STATUS_LABELS: Record<BoardingPassStatus, string> = {
  upcoming: 'Upcoming',
  checked_in: 'Checked In',
  boarded: 'Boarded',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

function formatDepartureTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const day = days[date.getDay()];
    const month = date.toLocaleString('en-US', { month: 'short' });
    const dateNum = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const mins = date.getMinutes().toString().padStart(2, '0');
    return `${day} ${month} ${dateNum} • ${hours}:${mins}`;
  } catch {
    return isoString;
  }
}

export function BoardingPassCard({ pass, onPress }: BoardingPassCardProps) {
  const statusColor = STATUS_COLORS[pass.status];

  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={styles.wrapper}>
      <LinearGradient
        colors={['#1a1035', '#0f0a2a'] as [string, string]}
        style={styles.card}
      >
        {/* Top row: airline + flight number */}
        <View style={styles.topRow}>
          <Text style={styles.airline}>{pass.airline}</Text>
          <Text style={styles.flightNumber}>{pass.flightNumber}</Text>
        </View>

        {/* Airport codes row */}
        <View style={styles.airportRow}>
          <View style={styles.airportBlock}>
            <Text style={styles.iataCode}>{pass.origin}</Text>
            <Text style={styles.cityName}>{pass.originCity}</Text>
          </View>

          <View style={styles.routeCenter}>
            <Text style={styles.planeIcon}>✈</Text>
            <View style={styles.dashedLine} />
          </View>

          <View style={[styles.airportBlock, styles.airportBlockRight]}>
            <Text style={styles.iataCode}>{pass.destination}</Text>
            <Text style={styles.cityName}>{pass.destinationCity}</Text>
          </View>
        </View>

        {/* Details row */}
        <View style={styles.detailsRow}>
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>DATE</Text>
            <Text style={styles.detailValue} numberOfLines={1}>
              {formatDepartureTime(pass.departureTime)}
            </Text>
          </View>
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>SEAT</Text>
            <Text style={styles.detailValue}>{pass.seat ?? '—'}</Text>
          </View>
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>GATE</Text>
            <Text style={styles.detailValue}>{pass.gate ?? '—'}</Text>
          </View>
          <View style={[styles.statusBadge, { borderColor: statusColor }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>
              {STATUS_LABELS[pass.status]}
            </Text>
          </View>
        </View>

        {/* Dashed separator */}
        <View style={styles.separatorRow}>
          <View style={styles.notch} />
          <View style={styles.dashedSeparator} />
          <View style={[styles.notch, styles.notchRight]} />
        </View>

        {/* Bottom strip */}
        <View style={styles.bottomStrip}>
          <View style={styles.boardingGroupBlock}>
            <Text style={styles.boardingGroupLabel}>BOARDING</Text>
            <Text style={styles.boardingGroupValue}>{pass.boardingGroup ?? 'A'}</Text>
          </View>

          {pass.barcode ? (
            <View style={styles.barcodePlaceholder}>
              {Array.from({ length: 16 }).map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.barcodeLine,
                    { width: i % 3 === 0 ? 3 : 1.5, opacity: i % 5 === 0 ? 1 : 0.6 },
                  ]}
                />
              ))}
            </View>
          ) : null}
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginHorizontal: Spacing['4'],
    marginBottom: Spacing['4'],
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
    shadowColor: '#a78bfa',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 12,
  },
  card: {
    borderRadius: BorderRadius.xl,
    padding: Spacing['5'],
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing['4'],
  },
  airline: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    color: 'rgba(255,255,255,0.9)',
    letterSpacing: 0.5,
  },
  flightNumber: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    color: '#a78bfa',
  },
  airportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing['4'],
  },
  airportBlock: {
    flex: 1,
    alignItems: 'flex-start',
  },
  airportBlockRight: {
    alignItems: 'flex-end',
  },
  iataCode: {
    fontSize: FontSize['3xl'],
    fontWeight: FontWeight.black,
    color: '#ffffff',
    letterSpacing: 2,
  },
  cityName: {
    fontSize: FontSize.xs,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 2,
  },
  routeCenter: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing['1'],
  },
  planeIcon: {
    fontSize: FontSize.lg,
    color: '#a78bfa',
  },
  dashedLine: {
    width: '80%',
    height: 1,
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.4)',
  },
  detailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['3'],
    marginBottom: Spacing['4'],
  },
  detailItem: {
    flex: 1,
  },
  detailLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semiBold,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 1,
    marginBottom: 2,
  },
  detailValue: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semiBold,
    color: '#ffffff',
  },
  statusBadge: {
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing['2'],
    paddingVertical: 3,
  },
  statusText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semiBold,
    letterSpacing: 0.5,
  },
  separatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: -Spacing['5'],
    marginBottom: Spacing['4'],
  },
  notch: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#0a0a1a',
    marginLeft: -7,
  },
  notchRight: {
    marginLeft: 0,
    marginRight: -7,
  },
  dashedSeparator: {
    flex: 1,
    height: 1,
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  bottomStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  boardingGroupBlock: {},
  boardingGroupLabel: {
    fontSize: FontSize.xs,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 1,
    marginBottom: 2,
  },
  boardingGroupValue: {
    fontSize: FontSize['2xl'],
    fontWeight: FontWeight.black,
    color: '#ffffff',
  },
  barcodePlaceholder: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 24,
    gap: 2,
  },
  barcodeLine: {
    height: '100%',
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderRadius: 0.5,
  },
});
