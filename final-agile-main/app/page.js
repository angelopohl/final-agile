'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const user = localStorage.getItem('user');
    
    if (user) {
      router.push('/dashboard');
    } else {
      router.push('/login');
    }
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="animate-pulse flex flex-col items-center">
        <div className="h-12 w-12 bg-blue-600 rounded-full mb-4"></div>
        <p className="text-gray-500">Cargando sistema...</p>
      </div>
    </div>
  );
}