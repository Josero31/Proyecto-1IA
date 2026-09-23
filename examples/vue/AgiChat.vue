<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
// Importar el paquete registra <agichat-widget> como custom element.
import '@agichat/widget-sdk';
import type { AgentTransport, AgiChatWidgetElement } from '@agichat/widget-sdk';

const props = defineProps<{
  agentName?: string;
  welcomeMessage?: string;
  placeholder?: string;
  position?: 'bottom-right' | 'bottom-left';
  /** Si se omite, el widget usa MockAgentTransport. */
  transport?: AgentTransport;
}>();

const emit = defineEmits<{
  open: [];
  close: [];
}>();

const widget = ref<AgiChatWidgetElement | null>(null);

function applyTransport(): void {
  if (widget.value && props.transport) {
    widget.value.transport = props.transport;
  }
}

onMounted(applyTransport);
watch(() => props.transport, applyTransport);
</script>

<template>
  <agichat-widget
    ref="widget"
    :agent-name="agentName"
    :welcome-message="welcomeMessage"
    :placeholder="placeholder"
    :position="position"
    @agichat-open="emit('open')"
    @agichat-close="emit('close')"
  />
</template>
