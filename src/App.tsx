/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import CalculatorScreen from './components/CalculatorScreen';
import { VisionProvider } from './components/VisionProvider';

export default function App() {
  const mockConfig = {
    currency: 'BRL',
    locale: 'pt-BR'
  };

  return (
    <VisionProvider>
      <main className="min-h-screen bg-slate-50 font-sans">
        <CalculatorScreen 
          config={mockConfig} 
          user={null}
          onApply={(data) => console.log('Applied:', data)}
        />
      </main>
    </VisionProvider>
  );
}
