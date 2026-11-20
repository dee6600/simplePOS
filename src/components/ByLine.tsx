import { StyleSheet, Text, type TextStyle } from 'react-native';

import { colors } from '../theme';

/** A person's name inside a line of text ("by Dad"), in bold so it stands out. Nest it inside a <Text>. */
export function Name({ children, style }: { children: string; style?: TextStyle }) {
  return <Text style={[styles.name, style]}>{children}</Text>;
}

/** "by Dad · edited by Mom" (the edit part only when someone else changed it). Nest it inside a <Text>. */
export function ByLine({ createdBy, updatedBy, edited = 'edited by' }: {
  createdBy: string;
  updatedBy?: string;
  /** Wording for the second part, e.g. "last edited by". */
  edited?: string;
}) {
  return (
    <>
      by <Name>{createdBy || 'unknown'}</Name>
      {updatedBy && updatedBy !== createdBy ? (
        <>
          {` · ${edited} `}
          <Name>{updatedBy}</Name>
        </>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  name: { fontWeight: '900', color: colors.text },
});
