import dynamic from 'next/dynamic';

// Dynamically import the component to disable SSR
const WebMap = dynamic(() => import('../../components/WebMap'), {
  ssr: false,
});

export default function MapPage() {
  return <WebMap />;
}
