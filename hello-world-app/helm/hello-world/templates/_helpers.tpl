{{- define "hello-world.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" | lower -}}
{{- end -}}

{{- define "hello-world.fullname" -}}
{{- $name := include "hello-world.name" . -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" | lower -}}
{{- end -}}

{{- define "hello-world.selectorLabels" -}}
app.kubernetes.io/name: {{ include "hello-world.name" . }}
app.kubernetes.io/instance: {{ .Release.Name | lower }}
{{- end -}}

{{- define "hello-world.labels" -}}
{{ include "hello-world.selectorLabels" . }}
helm.sh/chart: {{ include "hello-world.chart" . }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
{{- end -}}

{{- define "hello-world.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | lower -}}
{{- end -}}