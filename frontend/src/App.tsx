import { RouterProvider } from 'react-router-dom';
import { router } from './router';

/**
 * 顶层组件：挂载 RouterProvider。
 * 路由表定义见 src/router.tsx。
 */
export default function App() {
  return <RouterProvider router={router} />;
}
