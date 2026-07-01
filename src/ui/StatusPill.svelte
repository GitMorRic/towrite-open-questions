<script lang="ts">
  import type { OpenQuestionStatus } from "../core/types";

  export let status: OpenQuestionStatus;
</script>

<span class={`towrite-status towrite-status-${status}`}>{status}</span>
