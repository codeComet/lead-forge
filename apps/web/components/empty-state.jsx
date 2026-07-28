import { Card, CardContent } from "@/components/ui/card";

export function EmptyState({ icon: Icon, title, description, children }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
        {Icon && (
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Icon className="h-7 w-7" />
          </div>
        )}
        <div>
          <h3 className="text-lg font-medium">{title}</h3>
          {description && (
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}
