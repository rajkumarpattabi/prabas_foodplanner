import { Navigate, Route, Routes } from 'react-router'
import { DriveAutoBackup } from './backup/drive/DriveAutoBackup.tsx'
import { ReminderSync } from './reminders/ReminderSync.tsx'
import { SyncStatus } from './components/SyncStatus.tsx'
import { TabBar } from './components/TabBar.tsx'
import { BalanceScreen } from './screens/BalanceScreen.tsx'
import { CalendarScreen } from './screens/CalendarScreen.tsx'
import { DishesScreen } from './screens/DishesScreen.tsx'
import { PlanScreen } from './screens/PlanScreen.tsx'
import { SettingsScreen } from './screens/SettingsScreen.tsx'
import { ShopScreen } from './screens/ShopScreen.tsx'
import { StockScreen } from './screens/StockScreen.tsx'

/** The signed-in app: scrolling screen content above a fixed bottom tab bar. */
export default function App() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <DriveAutoBackup />
      <ReminderSync />
      <SyncStatus />
      <main className="flex-1 overflow-y-auto">
        <Routes>
          <Route path="/plan" element={<PlanScreen />} />
          <Route path="/stock" element={<StockScreen />} />
          <Route path="/shop" element={<ShopScreen />} />
          <Route path="/dishes" element={<DishesScreen />} />
          <Route path="/settings" element={<SettingsScreen />} />
          <Route path="/calendar" element={<CalendarScreen />} />
          <Route path="/balance" element={<BalanceScreen />} />
          <Route path="*" element={<Navigate to="/plan" replace />} />
        </Routes>
      </main>
      <TabBar />
    </div>
  )
}
