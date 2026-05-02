import PokerLogger from './PokerLogger';
import ErrorBoundary from './components/ErrorBoundary';

function App() {
  return (
    <ErrorBoundary>
      <PokerLogger />
    </ErrorBoundary>
  );
}

export default App;
