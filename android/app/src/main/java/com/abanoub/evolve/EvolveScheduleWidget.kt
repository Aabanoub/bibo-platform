package com.abanoub.evolve

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.RemoteViews
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * EvolveScheduleWidget
 * Native Android Home Screen Wallpaper Grid Widget (4x2 or 2x2)
 * Displays today's AI planned study block, active timer status, and 1-tap quick actions.
 */
class EvolveScheduleWidget : AppWidgetProvider() {

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        for (appWidgetId in appWidgetIds) {
            updateAppWidget(context, appWidgetManager, appWidgetId)
        }
    }

    companion object {
        fun updateAppWidget(
            context: Context,
            appWidgetManager: AppWidgetManager,
            appWidgetId: Int
        ) {
            val views = RemoteViews(context.packageName, R.layout.evolve_widget_layout)

            // 1. Current Date
            val dateFormat = SimpleDateFormat("EEE, MMM d", Locale.getDefault())
            views.setTextViewText(R.id.widget_date_text, dateFormat.format(Date()))

            // 2. Open Timer Deep Link Intent
            val timerIntent = Intent(Intent.ACTION_VIEW, Uri.parse("https://bibo-platform.vercel.app/tasks?action=timer")).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }
            val timerPendingIntent = PendingIntent.getActivity(
                context,
                0,
                timerIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            views.setOnClickPendingIntent(R.id.widget_btn_open_timer, timerPendingIntent)

            // 3. Open Schedule Deep Link Intent
            val scheduleIntent = Intent(Intent.ACTION_VIEW, Uri.parse("https://bibo-platform.vercel.app/tasks?tab=planner")).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }
            val schedulePendingIntent = PendingIntent.getActivity(
                context,
                1,
                scheduleIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            views.setOnClickPendingIntent(R.id.widget_btn_open_schedule, schedulePendingIntent)

            // 4. Update the widget on home screen
            appWidgetManager.updateAppWidget(appWidgetId, views)
        }
    }
}
