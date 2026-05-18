import { Component, ErrorInfo, lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, keepPreviousData } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { BrowserRouter, HashRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { SidebarContextProvider } from "@/contexts/SidebarContext";
import { TopProgressBar } from "@/components/ui/top-progress-bar";
import { PageSkeleton } from "@/components/layout/PageSkeleton";
import { MobileRuntimeGuards } from "@/components/layout/MobileRuntimeGuards";
import { PushNotificationsBridge } from "@/components/layout/PushNotificationsBridge";
import { useInitialPrefetch } from "@/hooks/useInitialPrefetch";
import * as R from "@/lib/routePrefetch";

// Auth + entry stay eager (first paint)
import Auth from "./pages/Auth";
import StudentDashboard from "./pages/student/Dashboard";
import NotFound from "./pages/NotFound";

// Lazy-loaded route chunks (factories shared with hover-prefetch)
const StudentCourses = lazy(R.loadStudentCourses);
const StudentCourseLessons = lazy(R.loadStudentCourseLessons);
const StudentCourseSubjects = lazy(R.loadStudentCourseSubjects);
const StudentSubjectLessons = lazy(R.loadStudentSubjectLessons);
const StudentSubjectAssignments = lazy(R.loadStudentSubjectAssignments);
const StudentCourseExams = lazy(R.loadStudentCourseExams);
const StudentTakeExam = lazy(R.loadStudentTakeExam);
const StudentCertificates = lazy(R.loadStudentCertificates);
const CertificateDownload = lazy(R.loadCertificateDownload);
const StudentPayments = lazy(R.loadStudentPayments);
const StudentGrades = lazy(R.loadStudentGrades);
const StudentTakeActivity = lazy(R.loadStudentTakeActivity);
const Notifications = lazy(R.loadNotifications);
const ValidateCertificate = lazy(R.loadValidateCertificate);
const About = lazy(R.loadAbout);
const PrivacyPolicy = lazy(R.loadPrivacyPolicy);

const AdminDashboard = lazy(R.loadAdminDashboard);
const AdminCourses = lazy(R.loadAdminCourses);
const AdminCourseSubjects = lazy(R.loadAdminCourseSubjects);
const AdminSubjectContent = lazy(R.loadAdminSubjectContent);
const AdminCourseLessons = lazy(R.loadAdminCourseLessons);
const AdminCourseExams = lazy(R.loadAdminCourseExams);
const AdminExamQuestions = lazy(R.loadAdminExamQuestions);
const AdminActivityQuestions = lazy(R.loadAdminActivityQuestions);
const AdminUsers = lazy(R.loadAdminUsers);
const AdminEnrollments = lazy(R.loadAdminEnrollments);
const AdminPolos = lazy(R.loadAdminPolos);
const AdminSettings = lazy(R.loadAdminSettings);
const AdminFinance = lazy(R.loadAdminFinance);
const AdminStudentProgress = lazy(R.loadAdminStudentProgress);
const AdminEnrollmentDeclaration = lazy(R.loadAdminEnrollmentDeclaration);

const ProfessorDashboard = lazy(R.loadProfessorDashboard);
const ProfessorSubmissions = lazy(R.loadProfessorSubmissions);

const PoloDashboard = lazy(R.loadPoloDashboard);
const PoloEnrollments = lazy(R.loadPoloEnrollments);
const PoloCommissions = lazy(R.loadPoloCommissions);
const PoloStudentPayments = lazy(R.loadPoloStudentPayments);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 24 * 60 * 60 * 1000, // 24h — required for localStorage persistence
      refetchOnWindowFocus: false,
      retry: 1,
      // Stale-while-revalidate: keep showing previous data while refetching
      // so navigation back to a visited page is instant.
      placeholderData: keepPreviousData,
    },
  },
});

// Persist React Query cache to localStorage so the FIRST click after a cold
// start is as fast as the second one — even days later.
const persister = createSyncStoragePersister({
  storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  key: 'ead-rq-cache-v1',
  throttleTime: 1000,
});

class AppErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('App bootstrap error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background p-6">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
            <h1 className="text-2xl font-semibold text-foreground">Erro ao abrir o app</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Feche e abra novamente. Se continuar, reinstale o APK mais recente.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

function RouteFallback() {
  return <PageSkeleton />;
}

function ProtectedRoute({ children, allowedRoles }: { children: React.ReactNode; allowedRoles?: string[] }) {
  const { user, role, loading } = useAuth();

  if (loading) {
    return <RouteFallback />;
  }

  if (!user) return <Navigate to="/auth" replace />;
  if (allowedRoles && role && !allowedRoles.includes(role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

function DashboardRedirect() {
  const { role } = useAuth();
  const isMobile = window.innerWidth < 768;
  if (!role) return <RouteFallback />;
  if (role === 'admin') return <Navigate to="/admin" replace />;
  if (role === 'professor') return <Navigate to="/professor" replace />;
  if (role === 'polo') return <Navigate to="/polo" replace />;
  if (role === 'aluno' && isMobile) return <Navigate to="/student/courses" replace />;
  return <Navigate to="/student/dashboard" replace />;
}

function PrefetchRunner() {
  useInitialPrefetch();
  return null;
}

function AppRoutes() {
  const { user, isRecoveryMode } = useAuth();
  const location = useLocation();

  return (
    <Suspense fallback={<RouteFallback />}>
      <div key={location.pathname} className="page-route-transition">
        <Routes>
          <Route path="/" element={user ? <Navigate to="/dashboard" replace /> : <Navigate to="/auth" replace />} />
          <Route path="/auth" element={user && !isRecoveryMode ? <Navigate to="/dashboard" replace /> : <Auth />} />
          <Route path="/dashboard" element={<ProtectedRoute><DashboardRedirect /></ProtectedRoute>} />

          {/* Student Routes */}
          <Route path="/student/dashboard" element={<ProtectedRoute allowedRoles={['aluno']}><StudentDashboard /></ProtectedRoute>} />
          <Route path="/student/courses" element={<ProtectedRoute allowedRoles={['aluno']}><StudentCourses /></ProtectedRoute>} />
          <Route path="/student/courses/:courseId/subjects" element={<ProtectedRoute allowedRoles={['aluno']}><StudentCourseSubjects /></ProtectedRoute>} />
          <Route path="/student/courses/:courseId/subjects/:subjectId" element={<ProtectedRoute allowedRoles={['aluno']}><StudentSubjectLessons /></ProtectedRoute>} />
          <Route path="/student/courses/:courseId/subjects/:subjectId/assignments" element={<ProtectedRoute allowedRoles={['aluno']}><StudentSubjectAssignments /></ProtectedRoute>} />
          <Route path="/student/courses/:courseId/subjects/:subjectId/activities/:activityId" element={<ProtectedRoute allowedRoles={['aluno']}><StudentTakeActivity /></ProtectedRoute>} />
          <Route path="/student/courses/:courseId/subjects/:subjectId/exams/:examId" element={<ProtectedRoute allowedRoles={['aluno']}><StudentTakeExam /></ProtectedRoute>} />
          <Route path="/student/courses/:courseId/lessons" element={<ProtectedRoute allowedRoles={['aluno']}><StudentCourseLessons /></ProtectedRoute>} />
          <Route path="/student/courses/:courseId/exams" element={<ProtectedRoute allowedRoles={['aluno']}><StudentCourseExams /></ProtectedRoute>} />
          <Route path="/student/courses/:courseId/exams/:examId" element={<ProtectedRoute allowedRoles={['aluno']}><StudentTakeExam /></ProtectedRoute>} />
          <Route path="/student/certificates" element={<ProtectedRoute allowedRoles={['aluno']}><StudentCertificates /></ProtectedRoute>} />
          <Route path="/student/certificates/:certificateId/download" element={<ProtectedRoute allowedRoles={['aluno']}><CertificateDownload /></ProtectedRoute>} />
          <Route path="/student/payments" element={<ProtectedRoute allowedRoles={['aluno']}><StudentPayments /></ProtectedRoute>} />
          <Route path="/student/grades" element={<ProtectedRoute allowedRoles={['aluno']}><StudentGrades /></ProtectedRoute>} />
          <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
          <Route path="/about" element={<ProtectedRoute><About /></ProtectedRoute>} />
          <Route path="/privacy-policy" element={<ProtectedRoute><PrivacyPolicy /></ProtectedRoute>} />

          {/* Public Routes */}
          <Route path="/certificate/validate/:hash" element={<ValidateCertificate />} />

          {/* Admin Routes */}
          <Route path="/admin" element={<ProtectedRoute allowedRoles={['admin']}><AdminDashboard /></ProtectedRoute>} />
          <Route path="/admin/courses" element={<ProtectedRoute allowedRoles={['admin']}><AdminCourses /></ProtectedRoute>} />
          <Route path="/admin/courses/:courseId/subjects" element={<ProtectedRoute allowedRoles={['admin']}><AdminCourseSubjects /></ProtectedRoute>} />
          <Route path="/admin/courses/:courseId/subjects/:subjectId" element={<ProtectedRoute allowedRoles={['admin']}><AdminSubjectContent /></ProtectedRoute>} />
          <Route path="/admin/courses/:courseId/lessons" element={<ProtectedRoute allowedRoles={['admin']}><AdminCourseLessons /></ProtectedRoute>} />
          <Route path="/admin/courses/:courseId/exams" element={<ProtectedRoute allowedRoles={['admin']}><AdminCourseExams /></ProtectedRoute>} />
          <Route path="/admin/courses/:courseId/exams/:examId/questions" element={<ProtectedRoute allowedRoles={['admin']}><AdminExamQuestions /></ProtectedRoute>} />
          <Route path="/admin/courses/:courseId/subjects/:subjectId/activities/:activityId/questions" element={<ProtectedRoute allowedRoles={['admin']}><AdminActivityQuestions /></ProtectedRoute>} />
          <Route path="/admin/users" element={<ProtectedRoute allowedRoles={['admin']}><AdminUsers /></ProtectedRoute>} />
          <Route path="/admin/enrollments" element={<ProtectedRoute allowedRoles={['admin']}><AdminEnrollments /></ProtectedRoute>} />
          <Route path="/admin/declaration" element={<ProtectedRoute allowedRoles={['admin']}><AdminEnrollmentDeclaration /></ProtectedRoute>} />
          <Route path="/admin/polos" element={<ProtectedRoute allowedRoles={['admin']}><AdminPolos /></ProtectedRoute>} />
          <Route path="/admin/finance" element={<ProtectedRoute allowedRoles={['admin']}><AdminFinance /></ProtectedRoute>} />
          <Route path="/admin/settings" element={<ProtectedRoute allowedRoles={['admin']}><AdminSettings /></ProtectedRoute>} />
          <Route path="/admin/student-progress" element={<ProtectedRoute allowedRoles={['admin']}><AdminStudentProgress /></ProtectedRoute>} />

          {/* Professor Routes */}
          <Route path="/professor" element={<ProtectedRoute allowedRoles={['professor']}><ProfessorDashboard /></ProtectedRoute>} />
          <Route path="/professor/courses" element={<ProtectedRoute allowedRoles={['professor']}><AdminCourses /></ProtectedRoute>} />
          <Route path="/professor/courses/:courseId/subjects" element={<ProtectedRoute allowedRoles={['professor']}><AdminCourseSubjects /></ProtectedRoute>} />
          <Route path="/professor/courses/:courseId/subjects/:subjectId" element={<ProtectedRoute allowedRoles={['professor']}><AdminSubjectContent /></ProtectedRoute>} />
          <Route path="/professor/courses/:courseId/subjects/:subjectId/activities/:activityId/questions" element={<ProtectedRoute allowedRoles={['professor']}><AdminActivityQuestions /></ProtectedRoute>} />
          <Route path="/professor/courses/:courseId/exams" element={<ProtectedRoute allowedRoles={['professor']}><AdminCourseExams /></ProtectedRoute>} />
          <Route path="/professor/courses/:courseId/exams/:examId/questions" element={<ProtectedRoute allowedRoles={['professor']}><AdminExamQuestions /></ProtectedRoute>} />
          <Route path="/professor/submissions" element={<ProtectedRoute allowedRoles={['professor']}><ProfessorSubmissions /></ProtectedRoute>} />

          {/* Polo Routes */}
          <Route path="/polo" element={<ProtectedRoute allowedRoles={['polo']}><PoloDashboard /></ProtectedRoute>} />
          <Route path="/polo/enrollments" element={<ProtectedRoute allowedRoles={['polo']}><PoloEnrollments /></ProtectedRoute>} />
          <Route path="/polo/student-payments" element={<ProtectedRoute allowedRoles={['polo']}><PoloStudentPayments /></ProtectedRoute>} />
          <Route path="/polo/commissions" element={<ProtectedRoute allowedRoles={['polo']}><PoloCommissions /></ProtectedRoute>} />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </div>
    </Suspense>
  );
}

const Router = Capacitor.isNativePlatform() ? HashRouter : BrowserRouter;

const App = () => (
  <PersistQueryClientProvider
    client={queryClient}
    persistOptions={{
      persister,
      maxAge: 24 * 60 * 60 * 1000, // 24h
      buster: 'v1',
    }}
  >
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AppErrorBoundary>
        <Router>
          <AuthProvider>
            <SidebarContextProvider>
              <MobileRuntimeGuards />
              <PushNotificationsBridge />
              <TopProgressBar />
              <PrefetchRunner />
              <AppRoutes />
            </SidebarContextProvider>
          </AuthProvider>
        </Router>
      </AppErrorBoundary>
    </TooltipProvider>
  </PersistQueryClientProvider>
);

export default App;
