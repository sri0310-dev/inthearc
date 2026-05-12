import dynamic from 'next/dynamic';

const SwingTradeApp = dynamic(() => import('@/components/SwingTradeApp'), { ssr: false });

export default function Home() {
  return <SwingTradeApp />;
}
