/**
 * Centralized lazy route imports + prefetch helpers.
 * 
 * Each route is a () => import() factory. Calling it triggers Vite to start
 * downloading the chunk (and the browser will cache it). Calling it multiple
 * times is safe — the dynamic import is memoized by the bundler.
 * 
 * Used by:
 *  - App.tsx (React.lazy)
 *  - Sidebar (hover prefetch)
 *  - Post-login warm-up
 */

// Student
export const loadStudentCourses = () => import('@/pages/student/Courses');
export const loadStudentCourseLessons = () => import('@/pages/student/CourseLessons');
export const loadStudentCourseSubjects = () => import('@/pages/student/CourseSubjects');
export const loadStudentSubjectLessons = () => import('@/pages/student/SubjectLessons');
export const loadStudentSubjectAssignments = () => import('@/pages/student/SubjectAssignments');
export const loadStudentCourseExams = () => import('@/pages/student/CourseExams');
export const loadStudentTakeExam = () => import('@/pages/student/TakeExam');
export const loadStudentTakeActivity = () => import('@/pages/student/TakeActivity');
export const loadStudentCertificates = () => import('@/pages/student/Certificates');
export const loadCertificateDownload = () => import('@/pages/student/CertificateDownload');
export const loadStudentPayments = () => import('@/pages/student/Payments');
export const loadStudentGrades = () => import('@/pages/student/Grades');
export const loadNotifications = () => import('@/pages/Notifications');
export const loadValidateCertificate = () => import('@/pages/ValidateCertificate');

// Admin
export const loadAdminDashboard = () => import('@/pages/admin/Dashboard');
export const loadAdminCourses = () => import('@/pages/admin/Courses');
export const loadAdminCourseSubjects = () => import('@/pages/admin/CourseSubjects');
export const loadAdminSubjectContent = () => import('@/pages/admin/SubjectContent');
export const loadAdminCourseLessons = () => import('@/pages/admin/CourseLessons');
export const loadAdminCourseExams = () => import('@/pages/admin/CourseExams');
export const loadAdminExamQuestions = () => import('@/pages/admin/ExamQuestions');
export const loadAdminActivityQuestions = () => import('@/pages/admin/ActivityQuestions');
export const loadAdminUsers = () => import('@/pages/admin/Users');
export const loadAdminEnrollments = () => import('@/pages/admin/Enrollments');
export const loadAdminPolos = () => import('@/pages/admin/Polos');
export const loadAdminSettings = () => import('@/pages/admin/Settings');
export const loadAdminFinance = () => import('@/pages/admin/Finance');
export const loadAdminStudentProgress = () => import('@/pages/admin/StudentProgress');
export const loadAdminEnrollmentDeclaration = () => import('@/pages/admin/EnrollmentDeclaration');

// Professor
export const loadProfessorDashboard = () => import('@/pages/professor/Dashboard');
export const loadProfessorSubmissions = () => import('@/pages/professor/Submissions');

// Polo
export const loadPoloDashboard = () => import('@/pages/polo/Dashboard');
export const loadPoloEnrollments = () => import('@/pages/polo/Enrollments');
export const loadPoloCommissions = () => import('@/pages/polo/Commissions');
export const loadPoloStudentPayments = () => import('@/pages/polo/StudentPayments');

/**
 * Map of route paths → loader. Used by Sidebar for hover-prefetch.
 */
export const ROUTE_LOADERS: Record<string, () => Promise<unknown>> = {
  '/student/dashboard': () => Promise.resolve(),
  '/student/courses': loadStudentCourses,
  '/student/grades': loadStudentGrades,
  '/student/payments': loadStudentPayments,
  '/student/certificates': loadStudentCertificates,
  '/notifications': loadNotifications,

  '/admin': loadAdminDashboard,
  '/admin/courses': loadAdminCourses,
  '/admin/users': loadAdminUsers,
  '/admin/enrollments': loadAdminEnrollments,
  '/admin/declaration': loadAdminEnrollmentDeclaration,
  '/admin/student-progress': loadAdminStudentProgress,
  '/admin/polos': loadAdminPolos,
  '/admin/finance': loadAdminFinance,
  '/admin/settings': loadAdminSettings,

  '/professor': loadProfessorDashboard,
  '/professor/courses': loadAdminCourses,
  '/professor/submissions': loadProfessorSubmissions,

  '/polo': loadPoloDashboard,
  '/polo/enrollments': loadPoloEnrollments,
  '/polo/student-payments': loadPoloStudentPayments,
  '/polo/commissions': loadPoloCommissions,
};

/**
 * Warm up the most likely next routes for a given role, right after login.
 * Uses requestIdleCallback so it never competes with the first paint.
 */
export function warmRoutesForRole(role: string | null) {
  if (!role) return;
  const ric: (cb: () => void) => void =
    (window as any).requestIdleCallback || ((cb) => setTimeout(cb, 200));

  ric(() => {
    if (role === 'admin') {
      loadAdminCourses(); loadAdminUsers(); loadAdminEnrollments(); loadAdminFinance();
    } else if (role === 'professor') {
      loadAdminCourses(); loadProfessorSubmissions();
    } else if (role === 'polo') {
      loadPoloEnrollments(); loadPoloStudentPayments(); loadPoloCommissions();
    } else if (role === 'aluno') {
      loadStudentCourses(); loadStudentGrades(); loadStudentPayments();
    }
  });
}
