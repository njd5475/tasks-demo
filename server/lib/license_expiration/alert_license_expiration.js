import moment from 'moment';

const SEV_CRITICAL = 'critical';
const SEV_MEDIUM = 'medium';

const getSeverity = daysTo => {
  if (daysTo < 0) {
    return SEV_CRITICAL;
  }
  if (daysTo < 10) {
    return SEV_MEDIUM;
  }
  return null;
};

export async function alertLicenseExpiration(server, taskInstance, state) {
  const { notificationService } = server.plugins.notifications;
  const loggerAction = notificationService.getActionForId('xpack-notifications-logger');

  for (const clusterUuid of Object.keys(state)) {
    const cluster = state[clusterUuid];
    const { cluster_name: clusterName, expiry } = cluster;
    const severity = getSeverity(expiry.days_to);
    state[clusterUuid].last_severity = severity;
    let result = Promise.resolve({});

    if (severity != null) {
      const clusterPre = `Cluster [${clusterName} / ${clusterUuid}] X-Pack license`;
      const expirationPost = `Expiration date: ${expiry.date}`;
      const baseAction = { task_id: taskInstance.id, severity };

      switch (severity) {
        case SEV_CRITICAL:
          result = loggerAction.performAction({
            ...baseAction,
            message: `${clusterPre} is expired! ${expirationPost}`,
          });
          break;
        case SEV_MEDIUM:
          result = loggerAction.performAction({
            ...baseAction,
            message: `${clusterPre} expires in less than 10 days!! ${expirationPost}`,
          });
          break;
      }
    }

    // save the time a notification loggerAction was performed, if one was
    const { error, ok: alertSuccess } = await result;
    if (error) {
      server.log(
        ['warn', 'alert', 'notification'],
        `Failure performing notification alert: ${error}`
      );
    } else if (alertSuccess) {
      state[clusterUuid].last_alerted = moment.utc().format();
    }
  }
}
