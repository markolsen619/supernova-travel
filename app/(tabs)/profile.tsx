import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { signOut } from 'firebase/auth';
import { auth } from '@/services/firebase';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUserStore } from '@/stores/useUserStore';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Colors } from '@/constants/colors';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';

type ProfileTab = 'Posts' | 'Trips' | 'Saved';
import { useState } from 'react';

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { user, tier } = useAuthStore();
  const { profile } = useUserStore();
  const [activeTab, setActiveTab] = useState<ProfileTab>('Posts');

  const handleSignOut = async () => {
    await signOut(auth);
  };

  const displayName = profile?.displayName ?? user?.displayName ?? 'Explorer';
  const username = displayName.toLowerCase().replace(/\s+/g, '_');

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 100 }}
      showsVerticalScrollIndicator={false}
    >
      <LinearGradient colors={['#1a0a3a', '#0a0a1a']} style={styles.headerGradient} />

      {/* Profile header */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing['4'] }]}>
        <Avatar uri={user?.photoURL} name={displayName} size="xl" />
        <Text style={styles.name}>{displayName}</Text>
        <Text style={styles.username}>@{username}</Text>
        <Badge variant={tier} style={styles.badge} />

        <View style={styles.stats}>
          {[
            { label: 'Followers', value: profile?.followersCount ?? 0 },
            { label: 'Following', value: profile?.followingCount ?? 0 },
            { label: 'Trips', value: 0 },
          ].map(({ label, value }) => (
            <View key={label} style={styles.stat}>
              <Text style={styles.statValue}>{value}</Text>
              <Text style={styles.statLabel}>{label}</Text>
            </View>
          ))}
        </View>

        <Button label="Edit Profile" variant="secondary" size="sm" onPress={() => {}} style={styles.editBtn} />
      </View>

      {/* Content tabs */}
      <View style={styles.tabs}>
        {(['Posts', 'Trips', 'Saved'] as ProfileTab[]).map((tab) => (
          <TouchableOpacity key={tab} onPress={() => setActiveTab(tab)} style={styles.tab}>
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>{tab}</Text>
            {activeTab === tab && <View style={styles.tabIndicator} />}
          </TouchableOpacity>
        ))}
      </View>

      {/* Empty grid placeholder */}
      <View style={styles.empty}>
        <Text style={styles.emptyIcon}>✦</Text>
        <Text style={styles.emptyText}>Your travel story starts here</Text>
      </View>

      {/* Settings */}
      <View style={styles.settings}>
        <TouchableOpacity style={styles.settingRow} onPress={handleSignOut}>
          <Text style={styles.settingText}>Sign Out</Text>
          <Text style={styles.settingChevron}>→</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background.primary },
  headerGradient: { position: 'absolute', top: 0, left: 0, right: 0, height: 280 },
  header: { alignItems: 'center', paddingHorizontal: Spacing['6'], paddingBottom: Spacing['6'] },
  name: { fontSize: FontSize.xl, fontWeight: FontWeight.black, color: Colors.white, marginTop: Spacing['3'] },
  username: { fontSize: FontSize.sm, color: Colors.text.secondary, marginBottom: Spacing['2'] },
  badge: { marginBottom: Spacing['4'] },
  stats: { flexDirection: 'row', gap: Spacing['8'], marginBottom: Spacing['5'] },
  stat: { alignItems: 'center' },
  statValue: { fontSize: FontSize.xl, fontWeight: FontWeight.black, color: Colors.white },
  statLabel: { fontSize: FontSize.xs, color: Colors.text.tertiary },
  editBtn: {},
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)' },
  tab: { flex: 1, alignItems: 'center', paddingVertical: Spacing['3'], position: 'relative' },
  tabText: { fontSize: FontSize.sm, fontWeight: FontWeight.medium, color: Colors.text.tertiary },
  tabTextActive: { color: Colors.white },
  tabIndicator: { position: 'absolute', bottom: 0, left: '20%', right: '20%', height: 2, backgroundColor: Colors.brand.purple, borderRadius: 1 },
  empty: { alignItems: 'center', paddingVertical: Spacing['16'], gap: Spacing['3'] },
  emptyIcon: { fontSize: 40, color: Colors.brand.purple },
  emptyText: { fontSize: FontSize.base, color: Colors.text.tertiary },
  settings: { marginHorizontal: Spacing['6'], marginTop: Spacing['6'], borderRadius: BorderRadius.xl, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  settingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing['4'], backgroundColor: 'rgba(255,255,255,0.04)' },
  settingText: { fontSize: FontSize.base, color: Colors.semantic.error },
  settingChevron: { color: Colors.text.tertiary },
});
