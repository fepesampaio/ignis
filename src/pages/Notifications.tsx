import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { 
  Bell, 
  CheckCheck, 
  Check,
  Star,
  FileText,
  Info,
  Award,
  Download
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
  related_id: string | null;
  related_type: string | null;
}

export default function Notifications() {
  const { user, role } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ['all-notifications', user?.id, role],
    queryFn: async () => {
      let query = supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(15);

      if (role && role !== 'admin') {
        query = query.or(`target_role.eq.${role},target_role.is.null`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Notification[];
    },
    enabled: !!user,
  });

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const markAsReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notificationId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      const unreadIds = notifications.filter(n => !n.is_read).map(n => n.id);
      if (unreadIds.length === 0) return;
      
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .in('id', unreadIds);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      toast.success('Todas as notificações foram marcadas como lidas');
    },
  });

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'grade':
        return <Star className="h-5 w-5 text-yellow-500" />;
      case 'assignment':
        return <FileText className="h-5 w-5 text-blue-500" />;
      case 'certificate':
        return <Award className="h-5 w-5 text-green-500" />;
      default:
        return <Info className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'grade':
        return 'Correção';
      case 'assignment':
        return 'Trabalho';
      case 'certificate':
        return 'Certificado';
      default:
        return 'Informação';
    }
  };

  // Extract download link from message if present
  const extractLink = (message: string): { text: string; link: string | null } => {
    const linkMatch = message.match(/Baixar: (\/[^\s]+)/);
    if (linkMatch) {
      return {
        text: message.replace(/ Baixar: \/[^\s]+/, ''),
        link: linkMatch[1]
      };
    }
    return { text: message, link: null };
  };

  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.is_read) {
      markAsReadMutation.mutate(notification.id);
    }
    
    // Navigate to related content if available
    if (notification.related_type === 'certificate' && notification.related_id) {
      navigate(`/student/certificates/${notification.related_id}/download`);
    } else if (notification.related_type === 'assignment_submission' && notification.related_id) {
      // Fetch submission -> assignment -> course/subject to build the route
      const { data: submission } = await supabase
        .from('assignment_submissions')
        .select('assignment_id')
        .eq('id', notification.related_id)
        .single();
      
      if (submission) {
        const { data: assignment } = await supabase
          .from('assignments')
          .select('course_id, subject_id')
          .eq('id', submission.assignment_id)
          .single();
        
        if (assignment?.subject_id) {
          navigate(`/student/courses/${assignment.course_id}/subjects/${assignment.subject_id}/assignments`);
        }
      }
    }
  };

  return (
    <DashboardLayout
      title="Notificações"
      subtitle={unreadCount > 0 ? `${unreadCount} não lida${unreadCount > 1 ? 's' : ''}` : 'Todas lidas'}
    >
      <div className="space-y-4">
        {/* Actions */}
        {unreadCount > 0 && (
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => markAllAsReadMutation.mutate()}
              disabled={markAllAsReadMutation.isPending}
            >
              <CheckCheck className="h-4 w-4 mr-2" />
              Marcar todas como lidas
            </Button>
          </div>
        )}

        {/* Loading */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map(i => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        ) : notifications.length === 0 ? (
          /* Empty State */
          <Card>
            <CardContent className="py-12 text-center">
              <Bell className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">Nenhuma notificação</h3>
              <p className="text-muted-foreground">
                Você receberá notificações sobre correções e atualizações aqui.
              </p>
            </CardContent>
          </Card>
        ) : (
          /* Notifications List */
          <div className="space-y-3">
            {notifications.map(notification => {
              const { text: messageText, link: downloadLink } = extractLink(notification.message);
              
              return (
              <Card 
                key={notification.id}
                className={cn(
                  'transition-all cursor-pointer hover:shadow-md',
                  !notification.is_read && 'border-primary/50 bg-primary/5',
                  notification.type === 'certificate' && 'border-green-500/30'
                )}
                onClick={() => handleNotificationClick(notification)}
              >
                <CardContent className="p-4">
                  <div className="flex gap-4">
                    {/* Icon */}
                    <div className={cn(
                      'flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center',
                      notification.type === 'grade' && 'bg-yellow-100 dark:bg-yellow-900/30',
                      notification.type === 'assignment' && 'bg-blue-100 dark:bg-blue-900/30',
                      notification.type === 'certificate' && 'bg-green-100 dark:bg-green-900/30',
                      !['grade', 'assignment', 'certificate'].includes(notification.type) && 'bg-muted'
                    )}>
                      {getTypeIcon(notification.type)}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className={cn(
                              'font-medium',
                              !notification.is_read && 'font-semibold'
                            )}>
                              {notification.title}
                            </h4>
                            {!notification.is_read && (
                              <span className="w-2 h-2 bg-primary rounded-full" />
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {getTypeLabel(notification.type)}
                          </span>
                        </div>
                        <div className="text-right text-xs text-muted-foreground flex-shrink-0">
                          <div>{formatDistanceToNow(new Date(notification.created_at), { 
                            addSuffix: true, 
                            locale: ptBR 
                          })}</div>
                          <div className="hidden sm:block">
                            {format(new Date(notification.created_at), "dd/MM/yyyy 'às' HH:mm")}
                          </div>
                        </div>
                      </div>
                      
                      <p className="text-sm text-muted-foreground mt-2">
                        {messageText}
                      </p>

                      {/* Download button for certificates */}
                      {downloadLink && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-3 h-8"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(downloadLink);
                          }}
                        >
                          <Download className="h-3 w-3 mr-2" />
                          Baixar Certificado
                        </Button>
                      )}

                      {!notification.is_read && (
                        <div className="flex items-center gap-2 mt-3">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              markAsReadMutation.mutate(notification.id);
                            }}
                          >
                            <Check className="h-3 w-3 mr-1" />
                            Marcar como lida
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
